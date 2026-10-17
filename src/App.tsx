import { useMemo, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Check, ChevronDown, ChevronRight, Clapperboard, Download, Film, FolderOpen, HardDrive, LoaderCircle, Play, Pause, Scissors, Settings2, Sparkles, Volume2, WandSparkles } from 'lucide-react';
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
        <div className="brand"><span className="brand-mark"><Scissors size={21} strokeWidth={2.4} /></span><span>CUTWISE<span className="brand-ai">.</span><small>CREATOR STUDIO</small></span></div>
        <div className="sidebar-label">YOUR SPACE</div>
        <div className="sidebar-project"><span className="project-avatar"><Clapperboard size={17}/></span><span>Untitled project<small>Current session</small></span><ChevronDown size={14}/></div>
        <div className="sidebar-label nav-group">WORKSPACE</div>
        <button className="nav-item active"><Clapperboard size={18}/> Editor <span className="nav-indicator"/></button>
        <button className="nav-item" onClick={chooseVideo}><FolderOpen size={18}/> Media Library</button>
        <div className="sidebar-label tools-label">AI ASSIST</div>
        <button className="nav-item" onClick={analyze} disabled={!source || !!progress}><WandSparkles size={18}/> Smart Cuts <span className="nav-new">NEW</span></button>
        <div className="sidebar-bottom"><div className="privacy-icon"><HardDrive size={17}/></div><strong>Private by design</strong><p>Your footage stays on this device.</p><span className="online-dot"/> All systems local <small>Version 0.2 alpha</small></div>
      </aside>

      <main className="main">
        <header className="topbar"><div className="breadcrumbs">Projects <ChevronRight size={14}/> <strong>Untitled project</strong><span className="header-draft">DRAFT</span></div><div className="top-actions"><span className="top-local"><span className="online-dot"/> Local workspace</span><button className="export-button" onClick={exportVideo} disabled={!clips.some(c => c.enabled) || !!progress}><Download size={16}/> Export <ChevronRight size={14}/></button></div></header>
        <div className="workspace">
          <div className="editor-heading"><div><span className="eyebrow"><span className="eyebrow-line"/> YOUR CREATIVE SPACE</span><h1>Make every second count<span className="heading-period">.</span></h1><p>Shape a better first cut. Keep the creative control.</p></div><button className="button-primary" onClick={chooseVideo}><FolderOpen size={17}/> Import media <span className="button-plus">+</span></button></div>

          <div className="editor-grid">
            <section className="preview-panel"><div className="panel-heading"><span><span className="panel-icon"><Film size={16}/></span> Canvas <span className="panel-subtitle">/ Preview</span></span><span className="hint">{info ? `${info.width} × ${info.height}` : '16:9 · NO MEDIA'}</span></div>
              <div className="video-surface">{videoUrl ? <video key={videoUrl} ref={video} src={videoUrl} onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setMessage('This video codec cannot be previewed by the system webview. Transcoding support is planned.')} /> : <div className="empty-preview"><div className="empty-icon"><Film size={30}/></div><span className="empty-kicker">THE CANVAS IS YOURS</span><strong>Bring your story to life.</strong><p>Drop into your creative flow by importing footage.</p><button onClick={chooseVideo}><FolderOpen size={15}/> Browse files <ChevronRight size={15}/></button><span className="format-hint">MP4, MOV, MKV, WEBM & MORE</span></div>}</div>
              <div className="playback"><button aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay} disabled={!source}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><span className="timecode">{clock(currentTime)} <span>/ {clock(info?.duration ?? 0)}</span></span><input aria-label="Seek" type="range" min="0" max={info?.duration ?? 1} step="0.05" value={currentTime} disabled={!source} onChange={e => { const time = Number(e.target.value); if (video.current) video.current.currentTime = time; setCurrentTime(time); }}/><Volume2 size={16} className="muted-icon"/></div>
            </section>

            <section className="analysis-panel"><div className="panel-heading"><span><span className="panel-icon magic"><Sparkles size={16}/></span> Smart cuts</span><span className="alpha-tag">EARLY ACCESS</span></div><div className="analysis-body"><div className="feature-intro"><span className="feature-orb"><WandSparkles size={23}/></span><h2>Less silence.<br/>More story.</h2><p>Find the quiet moments and create a tighter cut in a click.</p></div><div className="setting-group"><label>Silence sensitivity <strong>{threshold} dB</strong></label><input type="range" min="-55" max="-20" value={threshold} onChange={e => setThreshold(Number(e.target.value))}/><div className="range-ends"><span>Less sensitive</span><span>More sensitive</span></div></div><div className="setting-group"><label>Minimum pause <strong>{minimumSilence.toFixed(2)}s</strong></label><input type="range" min="0.3" max="2" step="0.05" value={minimumSilence} onChange={e => setMinimumSilence(Number(e.target.value))}/></div><button className="analyze-button" onClick={analyze} disabled={!source || !!progress}>{progress ? <LoaderCircle size={16} className="spin"/> : <Sparkles size={16}/>} Generate smart cuts <ChevronRight size={16}/></button><div className="stat-grid"><div><span>Suggested clips</span><strong>{clips.length.toString().padStart(2,'0')}</strong></div><div><span>Final duration</span><strong>{clock(keptSeconds)}</strong></div></div><div className="info-note"><Settings2 size={15}/> Currently uses silence detection. Offline AI features are on the roadmap.</div></div></section>
          </div>

          <section className="timeline-panel"><div className="panel-heading"><span><span className="panel-icon"><Scissors size={16}/></span> Timeline <span className="panel-subtitle">/ Sequence 01</span></span><span className="hint">{clips.length ? `${clips.filter(c=>c.enabled).length} ACTIVE CLIPS` : 'AWAITING FOOTAGE'}</span></div><div className="timeline-content"><div className="timeline-ruler"><span>00:00</span><span>{clock((info?.duration ?? 0) / 4)}</span><span>{clock((info?.duration ?? 0) / 2)}</span><span>{clock((info?.duration ?? 0) * .75)}</span><span>{clock(info?.duration ?? 0)}</span></div><div className="timeline-track"><div className="track-label"><Film size={15}/> VIDEO <strong>01</strong></div><div className="track-clips">{info && clips.length ? clips.map((clip, i) => <button key={i} className={`clip ${clip.enabled ? '' : 'excluded'}`} style={{left:`${100*clip.start/info.duration}%`,width:`${100*(clip.end-clip.start)/info.duration}%`}} title={`Clip ${i+1}: ${clock(clip.start)}–${clock(clip.end)}. Click to ${clip.enabled?'exclude':'include'}.`} onClick={() => setClips(prev=>prev.map((c,j)=>j===i?{...c,enabled:!c.enabled}:c))}><span>{clip.enabled ? <Check size={12}/> : '×'} {i+1}</span></button>) : <span className="track-empty">Your smart cuts will appear here</span>}</div></div></div><div className="timeline-footer"><span><span className="legend-dot included"/> Included</span><span><span className="legend-dot removed"/> Excluded</span><span className="timeline-tip">Click a clip to toggle it</span></div></section>
          <footer className="statusbar"><span className="status-led"/>{progress || message}<span className="status-right">CUTWISE • LOCALLY PROCESSED</span></footer>
        </div>
      </main>
    </div>
  );
}
