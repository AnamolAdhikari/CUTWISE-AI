use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoInfo {
    filename: String,
    duration: f64,
    width: u32,
    height: u32,
}

#[derive(Clone, Deserialize, Serialize)]
struct Clip {
    start: f64,
    end: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Analysis {
    duration: f64,
    clips: Vec<Clip>,
    removed_seconds: f64,
}

fn probe(path: &Path) -> Result<VideoInfo, String> {
    if !path.is_file() { return Err("Media file does not exist".into()); }
    let output = Command::new("ffprobe")
        .args(["-v", "error", "-show_entries", "format=duration:stream=width,height", "-select_streams", "v:0", "-of", "json"])
        .arg(path).output().map_err(|e| format!("Cannot start ffprobe: {e}. Install FFmpeg."))?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).to_string()); }
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    let duration = value["format"]["duration"].as_str().ok_or("Missing duration")?.parse::<f64>().map_err(|e| e.to_string())?;
    if !duration.is_finite() || duration <= 0. { return Err("Invalid media duration".into()); }
    let stream = value["streams"].as_array().and_then(|a| a.first()).ok_or("No video stream found")?;
    Ok(VideoInfo {
        filename: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
        duration,
        width: stream["width"].as_u64().unwrap_or(0) as u32,
        height: stream["height"].as_u64().unwrap_or(0) as u32,
    })
}

#[tauri::command]
fn probe_video(path: String) -> Result<VideoInfo, String> { probe(Path::new(&path)) }

#[tauri::command]
fn analyze_video(path: String, threshold_db: i32, minimum_silence: f64) -> Result<Analysis, String> {
    if !(-70..=-10).contains(&threshold_db) || !(0.1..=10.).contains(&minimum_silence) {
        return Err("Invalid silence detection settings".into());
    }
    let info = probe(Path::new(&path))?;
    let output = Command::new("ffmpeg")
        .args(["-hide_banner", "-nostdin", "-i"]).arg(&path)
        .args(["-af", &format!("silencedetect=noise={threshold_db}dB:d={minimum_silence}"), "-f", "null", "-"])
        .output().map_err(|e| format!("Cannot start ffmpeg: {e}"))?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).to_string()); }
    let log = String::from_utf8_lossy(&output.stderr);
    let start_re = Regex::new(r"silence_start:\s*([0-9.]+)").map_err(|e| e.to_string())?;
    let end_re = Regex::new(r"silence_end:\s*([0-9.]+)").map_err(|e| e.to_string())?;
    let starts: Vec<f64> = start_re.captures_iter(&log).filter_map(|m| m[1].parse().ok()).collect();
    let ends: Vec<f64> = end_re.captures_iter(&log).filter_map(|m| m[1].parse().ok()).collect();
    let mut cursor = 0f64;
    let mut clips = Vec::new();
    for (index, start) in starts.iter().enumerate() {
        let end = ends.get(index).copied().unwrap_or(info.duration);
        let cut_start = (start + 0.12).min(info.duration).max(cursor);
        if cut_start - cursor >= 0.35 { clips.push(Clip { start: cursor, end: cut_start }); }
        cursor = (end - 0.12).max(cut_start).min(info.duration);
    }
    if info.duration - cursor >= 0.35 { clips.push(Clip { start: cursor, end: info.duration }); }
    let retained: f64 = clips.iter().map(|clip| clip.end - clip.start).sum();
    Ok(Analysis { duration: info.duration, clips, removed_seconds: (info.duration - retained).max(0.) })
}

#[tauri::command]
fn export_video(path: String, output: String, clips: Vec<Clip>) -> Result<(), String> {
    let source = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let target = PathBuf::from(&output);
    if target.exists() && fs::canonicalize(&target).map_err(|e| e.to_string())? == source { return Err("Cannot overwrite source footage".into()); }
    if target.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) != Some("mp4".into()) { return Err("Only MP4 output is supported".into()); }
    let duration = probe(&source)?.duration;
    if clips.is_empty() { return Err("No clips selected".into()); }
    let mut previous = 0.;
    for clip in &clips {
        if !clip.start.is_finite() || !clip.end.is_finite() || clip.start < previous || clip.end <= clip.start || clip.end > duration + 0.02 {
            return Err("Invalid or unordered clip range".into());
        }
        previous = clip.end;
    }
    let temp = std::env::temp_dir().join(format!("cutwise-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos()));
    fs::create_dir(&temp).map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        let mut manifest = String::new();
        for (index, clip) in clips.iter().enumerate() {
            let name = format!("clip-{index:04}.mp4");
            let piece = temp.join(&name);
            let output = Command::new("ffmpeg")
                .args(["-y", "-hide_banner", "-loglevel", "error", "-nostdin", "-ss", &clip.start.to_string(), "-i"])
                .arg(&source)
                .args(["-t", &(clip.end - clip.start).to_string(), "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"])
                .arg(&piece).output().map_err(|e| e.to_string())?;
            if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).to_string()); }
            manifest.push_str(&format!("file '{name}'\n"));
        }
        fs::write(temp.join("concat.txt"), manifest).map_err(|e| e.to_string())?;
        let rendered = temp.join("render.mp4");
        let output = Command::new("ffmpeg")
            .args(["-y", "-hide_banner", "-loglevel", "error", "-nostdin", "-f", "concat", "-safe", "0", "-i"])
            .arg(temp.join("concat.txt"))
            .args(["-c", "copy", "-movflags", "+faststart"])
            .arg(&rendered).output().map_err(|e| e.to_string())?;
        if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).to_string()); }
        // Write to a sibling temporary file, then rename, preventing partial output.
        let staging = target.with_extension("cutwise.tmp");
        fs::copy(&rendered, &staging).map_err(|e| e.to_string())?;
        fs::rename(staging, &target).map_err(|e| e.to_string())?;
        Ok(())
    })();
    let _ = fs::remove_dir_all(&temp);
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![probe_video, analyze_video, export_video])
        .run(tauri::generate_context!())
        .expect("error while running CUTWISE");
}
