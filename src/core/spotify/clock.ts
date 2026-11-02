/**
 * Posición de reproducción estimada entre lecturas del reproductor: se lee el estado cada
 * ~250 ms y entre medias se interpola con performance.now() para que el cursor vaya fluido.
 */
export class PlaybackClock {
  private positionMs = 0;
  private at = 0;
  private paused = true;

  update(positionMs: number, paused: boolean, now: number): void {
    this.positionMs = positionMs;
    this.paused = paused;
    this.at = now;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  position(now: number): number {
    return this.paused ? this.positionMs : this.positionMs + Math.max(0, now - this.at);
  }
}

/** Fragmento por defecto si la pieza aún no tiene uno: los primeros 30 s. */
export const DEFAULT_FRAGMENT_MS = 30_000;

/** Corrige un fragmento: inicio >= 0, fin > inicio y dentro de la canción. */
export function clampFragment(
  startMs: number,
  endMs: number,
  durationMs: number,
): { startMs: number; endMs: number } {
  const start = Math.min(Math.max(0, Math.round(startMs)), Math.max(0, durationMs - 1000));
  const end = Math.min(durationMs, Math.max(start + 1000, Math.round(endMs)));
  return { startMs: start, endMs: end };
}
