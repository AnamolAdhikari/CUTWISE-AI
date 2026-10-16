"""CUTWISE desktop prototype. Run: python desktop.py"""
from __future__ import annotations

import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from engine import Segment, analyze, export


class CutwiseApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("CUTWISE — Local First-Cut Editor")
        self.geometry("850x630")
        self.minsize(690, 500)
        self.configure(bg="#101827")
        self.source: Path | None = None
        self.segments: list[Segment] = []
        self.selected: list[tk.BooleanVar] = []
        self.status = tk.StringVar(value="Select a video to get started")
        self.summary = tk.StringVar(value="Your videos stay on your computer. Nothing is uploaded.")

        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("Dark.TFrame", background="#101827")
        style.configure("Dark.TLabel", background="#101827", foreground="#dce5f3", font=("Segoe UI", 10))
        style.configure("Accent.TButton", padding=(17, 9), font=("Segoe UI", 10, "bold"))
        frame = ttk.Frame(self, padding=24, style="Dark.TFrame")
        frame.pack(fill="both", expand=True)

        tk.Label(frame, text="◉  CUTWISE", bg="#101827", fg="#6ce2cc", font=("Segoe UI", 22, "bold")).pack(anchor="w")
        tk.Label(frame, text="A smarter first cut. Free, offline, and always editable.", bg="#101827", fg="#9caec6", font=("Segoe UI", 11)).pack(anchor="w", pady=(0, 18))

        buttons = ttk.Frame(frame, style="Dark.TFrame")
        buttons.pack(fill="x", pady=(0, 12))
        self.open_button = ttk.Button(buttons, text="1  Choose video", command=self.choose, style="Accent.TButton")
        self.open_button.pack(side="left", padx=(0, 8))
        self.analyze_button = ttk.Button(buttons, text="2  Analyze silence", command=self.start_analysis, state="disabled", style="Accent.TButton")
        self.analyze_button.pack(side="left", padx=(0, 8))
        self.export_button = ttk.Button(buttons, text="3  Export selected cuts", command=self.start_export, state="disabled", style="Accent.TButton")
        self.export_button.pack(side="left")

        tk.Label(frame, textvariable=self.summary, bg="#162235", fg="#e4ebf7", anchor="w", padx=14, pady=12, wraplength=730).pack(fill="x", pady=(6, 14))
        tk.Label(frame, text="SUGGESTED CLIPS  ·  Uncheck clips you do not want to include", bg="#101827", fg="#b4c7e0", font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(0, 8))

        container = tk.Frame(frame, bg="#162235")
        container.pack(fill="both", expand=True)
        canvas = tk.Canvas(container, bg="#162235", highlightthickness=0)
        scrollbar = ttk.Scrollbar(container, orient="vertical", command=canvas.yview)
        self.clips = tk.Frame(canvas, bg="#162235")
        self.clips.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=self.clips, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        tk.Label(frame, textvariable=self.status, bg="#101827", fg="#6ce2cc", anchor="w").pack(fill="x", pady=(14, 0))

    def choose(self):
        path = filedialog.askopenfilename(title="Choose source video", filetypes=[("Video files", "*.mp4 *.mov *.mkv *.webm *.avi"), ("All files", "*.*")])
        if path:
            self.source = Path(path)
            self.summary.set(f"Source: {self.source.name}")
            self.status.set("Ready to analyze")
            self.analyze_button.configure(state="normal")
            self.export_button.configure(state="disabled")
            self.clear_clips()

    def clear_clips(self):
        for child in self.clips.winfo_children():
            child.destroy()
        self.segments = []
        self.selected = []

    def busy(self, message, active):
        self.status.set(message)
        self.open_button.configure(state="disabled" if active else "normal")
        self.analyze_button.configure(state="disabled" if active else "normal")
        self.export_button.configure(state="disabled" if active else ("normal" if self.segments else "disabled"))

    def start_analysis(self):
        if not self.source:
            return
        self.busy("Analyzing locally…", True)
        source = self.source
        def work():
            try:
                result = analyze(source)
                self.after(0, lambda: self.render_analysis(result))
            except Exception as error:
                self.after(0, lambda detail=str(error): self.fail(detail))
        threading.Thread(target=work, daemon=True).start()

    def render_analysis(self, result):
        self.clear_clips()
        self.segments = [Segment(**item) for item in result["keeps"]]
        self.summary.set(f"{len(self.segments)} clips suggested  •  {result['estimated_removed']:.1f}s removable silence  •  {result['duration']:.1f}s original length")
        for i, segment in enumerate(self.segments):
            selected = tk.BooleanVar(value=True)
            self.selected.append(selected)
            line = tk.Checkbutton(self.clips, text=f"Clip {i+1:02d}    {segment.start:8.2f}s  →  {segment.end:8.2f}s     ({segment.duration:.2f}s)", variable=selected,
                                  bg="#162235", fg="#e4ebf7", activebackground="#162235", activeforeground="#6ce2cc",
                                  selectcolor="#273951", font=("Consolas", 10), anchor="w", padx=12, pady=7)
            line.pack(fill="x")
        self.busy("Review suggested clips before export", False)

    def start_export(self):
        if not self.source:
            return
        clips = [seg for seg, selected in zip(self.segments, self.selected) if selected.get()]
        if not clips:
            messagebox.showwarning("Nothing selected", "Select at least one clip to export.")
            return
        target = filedialog.asksaveasfilename(title="Export first cut", defaultextension=".mp4", filetypes=[("MP4 video", "*.mp4")], initialfile=f"{self.source.stem}-cutwise.mp4")
        if not target:
            return
        self.busy("Exporting locally… (this can take a while)", True)
        def work():
            try:
                export(self.source, Path(target), clips)
                self.after(0, lambda: self.finish(target))
            except Exception as error:
                self.after(0, lambda detail=str(error): self.fail(detail))
        threading.Thread(target=work, daemon=True).start()

    def finish(self, target):
        self.busy(f"Export complete: {target}", False)
        messagebox.showinfo("Export complete", f"Video saved to:\n{target}")

    def fail(self, detail):
        self.busy("Operation failed", False)
        messagebox.showerror("CUTWISE error", detail)


if __name__ == "__main__":
    CutwiseApp().mainloop()
