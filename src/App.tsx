import { useMemo, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Activity, Check, ChevronRight, Clapperboard, Download, Film, FolderOpen, LoaderCircle, Play, Pause, Scissors, Settings2, Sparkles, Volume2 } from 'lucide-react';
import type { Analysis, Clip, VideoInfo } from './types';
import { clock } from './types';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export default function App() {
  const [source, setSource] = useState('');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('Your footage never leaves your computer.');
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [threshold, setThreshold] = useState(-35);
  const [minimumSilence, setMinimumSilence] = useState(.65);
  const video = useRef<HTMLVideoElement>(null);
  const keptSeconds = useMemo(() => clips.filter(c => c.enabled).reduce((sum, c) => sum + c.end - c.start, 0), [clips]);
  const videoUrl = source && isTauri ? convertFileSrc(source) : '';

  async function chooseVideo() {
    if (!isTauri) { setMessage('Open CUTWISE in the Tauri desktop app to access local video files.'); return; }
    try {
      const path = await open({ multiple: false, filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] }] });
      if (typeof path !== 'string') return;
      setProgress('Loading video…');
      const details = await invoke<VideoInfo>('probe_video', { path });
      setSource(path); setInfo(details); setClips([]); setCurrentTime(0);
      setMessage(`${details.filename} loaded • ${details.width} × ${details.height}`);
    } catch (error) { setMessage(`Import failed: ${String(error)}`); }
    finally { setProgress(''); }
  }

  async function analyze() {
    if (!source) return;
    try {
      setProgress('Detecting quiet sections…');
      const result = await invoke<Analysis>('analyze_video', { path: source, thresholdDb: threshold, minimumSilence });
      setClips(result.clips.map(c => ({ ...c, enabled: true })));
      setMessage(`${result.clips.length} suggested clips • ${result.removedSeconds.toFixed(1)} seconds of removable silence`);
    } catch (error) { setMessage(`Analysis failed: ${String(error)}`); }
    finally { setProgress(''); }
  }

  async function exportVideo() {
    if (!source || !clips.some(c => c.enabled)) return;
    try {
      const output = await save({ defaultPath: `${info?.filename.replace(/\.[^.]+$/, '') ?? 'video'}-cutwise.mp4`, filters: [{ name: 'MP4 Video', extensions: ['mp4'] }] });
      if (!output) return;
      setProgress('Rendering first cut…');
      await invoke('export_video', { path: source, output, clips: clips.filter(c => c.enabled) });
      setMessage(`Export complete: ${output}`);
    } catch (error) { setMessage(`Export failed: ${String(error)}`); }
    finally { setProgress(''); }
  }

  function togglePlay() {
    if (!video.current) return;
    if (video.current.paused) void video.current.play().catch(() => setMessage('Unable to play this format in the system video preview.'));
    else video.current.pause();
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Activity size={23} strokeWidth={2.7} /></span><span>CUTWISE <span className="brand-ai">AI</span><small>LOCAL STUDIO</small></span></div>
        <div className="sidebar-label">WORKSPACE</div>
        <button className="nav-item active"><Clapperboard size={18}/> Editor <ChevronRight size={15} className="nav-chevron"/></button>
        <button className="nav-item" onClick={chooseVideo}><FolderOpen size={18}/> Media Library</button>
        <div className="sidebar-label tools-label">TOOLS</div>
        <button className="nav-item" onClick={analyze} disabled={!source || !!progress}><Scissors size={18}/> Smart Cuts</button>
        <div className="sidebar-bottom"><span className="online-dot"/> Offline processing <small>Alpha v0.2 • No cloud required</small></div>
      </aside>

      <main className="main">
        <header className="topbar"><div className="breadcrumbs">Workspace <ChevronRight size={14}/> <strong>Video editor</strong></div><div className="top-actions"><span className="project-badge">UNSAVED PROJECT</span><button className="export-button" onClick={exportVideo} disabled={!clips.some(c => c.enabled) || !!progress}><Download size={16}/> Export video</button></div></header>
        <div className="workspace">
          <div className="editor-heading"><div><span className="eyebrow">CREATIVE WORKSPACE</span><h1>Video editor</h1><p>Turn raw footage into a cleaner first cut, entirely on your device.</p></div><button className="button-primary" onClick={chooseVideo}><FolderOpen size={17}/> Import footage</button></div>

          <div className="editor-grid">
            <section className="preview-panel"><div className="panel-heading"><span><Film size={16}/> PREVIEW</span><span className="hint">{info ? `${info.width} × ${info.height}` : 'NO MEDIA'}</span></div>
              <div className="video-surface">{videoUrl ? <video key={videoUrl} ref={video} src={videoUrl} onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setMessage('This video codec cannot be previewed by the system webview. Transcoding support is planned.')} /> : <div className="empty-preview"><div className="empty-icon"><Film size={34}/></div><strong>Your next story starts here</strong><p>Import a video to begin editing.</p><button onClick={chooseVideo}>Choose a video <ChevronRight size={15}/></button></div>}</div>
              <div className="playback"><button aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay} disabled={!source}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><span className="timecode">{clock(currentTime)} <span>/ {clock(info?.duration ?? 0)}</span></span><input aria-label="Seek" type="range" min="0" max={info?.duration ?? 1} step="0.05" value={currentTime} disabled={!source} onChange={e => { const time = Number(e.target.value); if (video.current) video.current.currentTime = time; setCurrentTime(time); }}/><Volume2 size={16} className="muted-icon"/></div>
            </section>

            <section className="analysis-panel"><div className="panel-heading"><span><Sparkles size={16}/> SMART CUTS</span><span className="alpha-tag">ALPHA</span></div><div className="analysis-body"><p>Remove long pauses while keeping natural breathing room around speech.</p><label>Silence threshold <strong>{threshold} dB</strong></label><input type="range" min="-55" max="-20" value={threshold} onChange={e => setThreshold(Number(e.target.value))}/><label>Minimum silence <strong>{minimumSilence.toFixed(2)}s</strong></label><input type="range" min="0.3" max="2" step="0.05" value={minimumSilence} onChange={e => setMinimumSilence(Number(e.target.value))}/><button className="analyze-button" onClick={analyze} disabled={!source || !!progress}>{progress ? <LoaderCircle size={16} className="spin"/> : <Sparkles size={16}/>} Analyze footage</button><div className="stat-grid"><div><span>Suggested clips</span><strong>{clips.length}</strong></div><div><span>Edited duration</span><strong>{clock(keptSeconds)}</strong></div></div><div className="info-note"><Settings2 size={16}/> First-cut analysis is deterministic. AI transcription and pacing suggestions are coming next.</div></div></section>
          </div>

          <section className="timeline-panel"><div className="panel-heading"><span><Scissors size={16}/> EDIT TIMELINE</span><span className="hint">{clips.length ? `${clips.filter(c=>c.enabled).length} SELECTED CLIPS` : 'READY FOR IMPORT'}</span></div><div className="timeline-content"><div className="timeline-ruler"><span>00:00</span><span>{clock((info?.duration ?? 0) / 4)}</span><span>{clock((info?.duration ?? 0) / 2)}</span><span>{clock((info?.duration ?? 0) * .75)}</span><span>{clock(info?.duration ?? 0)}</span></div><div className="timeline-track"><div className="track-label"><Film size={15}/> Video 01</div><div className="track-clips">{info && clips.length ? clips.map((clip, i) => <button key={i} className={`clip ${clip.enabled ? '' : 'excluded'}`} style={{left:`${100*clip.start/info.duration}%`,width:`${100*(clip.end-clip.start)/info.duration}%`}} title={`Clip ${i+1}: ${clock(clip.start)}–${clock(clip.end)}. Click to ${clip.enabled?'exclude':'include'}.`} onClick={() => setClips(prev=>prev.map((c,j)=>j===i?{...c,enabled:!c.enabled}:c))}><span>{clip.enabled ? <Check size={12}/> : '×'} {i+1}</span></button>) : <span className="track-empty">Suggested cuts appear here after analysis</span>}</div></div></div><div className="timeline-footer"><span><span className="legend-dot included"/> Included</span><span><span className="legend-dot removed"/> Excluded</span><span className="timeline-tip">Select a clip to include or exclude it</span></div></section>
          <footer className="statusbar"><span className="status-led"/>{progress || message}<span className="status-right">CUTWISE • LOCALLY PROCESSED</span></footer>
        </div>
      </main>
    </div>
  );
}
