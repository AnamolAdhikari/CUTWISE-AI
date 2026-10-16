"""CUTWISE local-first editing primitives (standard library + FFmpeg)."""
from __future__ import annotations

import json
import re
import subprocess
import tempfile
from dataclasses import dataclass, asdict
from pathlib import Path


@dataclass(frozen=True)
class Segment:
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=True)


def duration_seconds(source: Path) -> float:
    result = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(source)])
    value = float(json.loads(result.stdout)["format"]["duration"])
    if value <= 0:
        raise ValueError("Media duration must be positive")
    return value


def detect_silences(source: Path, threshold_db: int = -35, minimum_seconds: float = .65) -> list[Segment]:
    result = subprocess.run([
        "ffmpeg", "-hide_banner", "-nostdin", "-i", str(source),
        "-af", f"silencedetect=noise={threshold_db}dB:d={minimum_seconds}",
        "-f", "null", "-"
    ], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:])
    beginnings = re.findall(r"silence_start: ([0-9.]+)", result.stderr)
    endings = re.findall(r"silence_end: ([0-9.]+)", result.stderr)
    # FFmpeg emits a start without an end when the file ends in silence.
    spans: list[Segment] = []
    for i, beginning in enumerate(beginnings):
        match = re.search(r"silence_end: ([0-9.]+)", result.stderr[result.stderr.find(f"silence_start: {beginning}"):])
        if match:
            spans.append(Segment(float(beginning), float(match.group(1))))
    return spans


def suggest_keeps(duration: float, silences: list[Segment], padding: float = .12, minimum_clip: float = .35) -> list[Segment]:
    """Return non-silent spans, retaining padding around speech."""
    cursor = 0.0
    keeps = []
    for silence in sorted(silences, key=lambda s: s.start):
        start = max(cursor, min(duration, silence.start + padding))
        end = max(start, min(duration, silence.end - padding))
        if start - cursor >= minimum_clip:
            keeps.append(Segment(cursor, start))
        cursor = max(cursor, end)
    if duration - cursor >= minimum_clip:
        keeps.append(Segment(cursor, duration))
    return keeps


def analyze(source: Path, threshold_db: int = -35, minimum_silence: float = .65) -> dict:
    source = source.expanduser().resolve(strict=True)
    duration = duration_seconds(source)
    silences = detect_silences(source, threshold_db, minimum_silence)
    keeps = suggest_keeps(duration, silences)
    return {"source": str(source), "duration": duration,
            "silences": [asdict(s) for s in silences],
            "keeps": [asdict(s) for s in keeps],
            "estimated_removed": max(0., duration - sum(s.duration for s in keeps))}


def export(source: Path, target: Path, keeps: list[Segment]) -> None:
    """Reencode selected spans; never alter the source file."""
    source = source.expanduser().resolve(strict=True)
    target = target.expanduser().resolve()
    if source == target:
        raise ValueError("Output cannot overwrite source media")
    if not keeps:
        raise ValueError("No segments selected")
    duration = duration_seconds(source)
    previous = 0.0
    for seg in keeps:
        if seg.start < previous - 1e-5 or seg.end > duration + .02 or seg.duration <= 0:
            raise ValueError("Segments must be ordered, positive and within media duration")
        previous = seg.end
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cutwise-") as temporary:
        directory = Path(temporary)
        pieces = []
        for i, seg in enumerate(keeps):
            piece = directory / f"clip-{i:04d}.mp4"
            run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-nostdin",
                 "-ss", str(seg.start), "-i", str(source), "-t", str(seg.duration),
                 "-map", "0:v:0?", "-map", "0:a:0?", "-c:v", "libx264",
                 "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", str(piece)])
            pieces.append(piece)
        concat_file = directory / "concat.txt"
        concat_file.write_text("".join(f"file '{p.name}'\n" for p in pieces))
        temp_output = directory / "result.mp4"
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-nostdin",
             "-f", "concat", "-safe", "0", "-i", str(concat_file),
             "-c", "copy", "-movflags", "+faststart", str(temp_output)])
        # Only replace the destination after a successful export.
        target.write_bytes(temp_output.read_bytes())
