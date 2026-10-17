# CUTWISE AI — local-first video editing

CUTWISE v0.2 is an early desktop editor built with **Tauri 2, React, TypeScript, Rust and FFmpeg**. It turns recorded footage into a suggested first cut by detecting extended silence. It runs locally; no uploads or paid APIs.

> **Alpha status:** CUTWISE does not use an AI model yet. Offline speech transcription, intelligent pacing, and full timeline editing are roadmap items. The new React app supports video preview in codecs supported by the operating system's webview, timeline clip selection, and Rust/FFmpeg processing.

## New desktop application (v0.2)

Install Node.js, Rust, Tauri's operating-system prerequisites, and FFmpeg. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform-specific setup.

```bash
npm ci
npm run tauri dev
```

The editor can import a video through the native file dialog, preview compatible formats, detect quiet sections, include/exclude suggested clips, and export an MP4. FFmpeg/FFprobe must be on the system PATH. Rendering is currently synchronous in the Rust command and may be slow with long footage. This is an **unreleased developer build**, not yet a signed installer.

## Legacy Python alpha

The original Python/Tkinter implementation is preserved for comparison and regression testing.

### Requirements

- Python 3.10+
- FFmpeg and FFprobe in PATH
- A desktop computer capable of encoding video

### macOS quick setup

Install Python 3 with Tkinter support and FFmpeg using your preferred package manager. On a Mac with Homebrew, a typical setup is:

```bash
brew install python-tk@3.13 ffmpeg
python3 desktop.py
```

If you use another Python version, install the matching `python-tk` package. Verify your Python can import Tkinter with `python3 -m tkinter`.

### Quick start

```bash
python desktop.py
```

Choose a video, analyze the audio, review suggested clips, then export an MP4. A command-line mode is also available:

```bash
python cli.py "/path/to/your-recording.mp4" --analysis decisions.json
python cli.py "/path/to/your-recording.mp4" --output first-cut.mp4
```

The original recording is never modified. Suggested cuts are heuristics and should always be reviewed. Processing reencodes clips using H.264 and AAC. This prototype does **not** yet include speech recognition, an AI model, a full timeline editor, or DaVinci integration. The basic desktop UI requires Tkinter, included with many Python installations (on Linux it may need to be installed separately).

## Roadmap

1. Desktop review UI with waveform and adjustable cut boundaries.
2. Offline transcription and captions (optional local Whisper model).
3. Story-driven cuts, face-aware reframing, and creator presets.
4. Editable timeline export, installers, and documented cross-platform tests.

## Privacy and rights

All footage stays on the user's computer. Only use material you own or have permission to edit. CUTWISE will not generate synthetic footage or images.
