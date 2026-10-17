export interface Clip { start: number; end: number; enabled: boolean; }
export interface Analysis { duration: number; clips: {start:number; end:number}[]; removedSeconds: number; }
export interface VideoInfo { duration: number; width: number; height: number; filename: string; }

export function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00';
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
