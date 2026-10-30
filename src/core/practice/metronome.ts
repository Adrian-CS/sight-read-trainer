/** Metrónomo con Web Audio. La programación de golpes es pura y testeable (beatsBetween). */

export type Beat = { index: number; at: number; accent: boolean };

/**
 * Golpes con instante en [from, to). El golpe 0 cae en `origin`; los negativos son la cuenta previa.
 * Acento en el primer tiempo de cada compás.
 */
export function beatsBetween(
  origin: number,
  msPerBeat: number,
  beatsPerBar: number,
  from: number,
  to: number,
): Beat[] {
  const out: Beat[] = [];
  const first = Math.ceil((from - origin) / msPerBeat - 1e-9);
  for (let i = first; origin + i * msPerBeat < to; i++) {
    out.push({
      index: i,
      at: origin + i * msPerBeat,
      accent: ((i % beatsPerBar) + beatsPerBar) % beatsPerBar === 0,
    });
  }
  return out;
}

const LOOKAHEAD_MS = 120;
const TICK_MS = 25;

/**
 * Programa clics por adelantado en el reloj de audio. Los instantes se dan en la base de
 * performance.now() (la misma que los eventos MIDI) y se convierten al reloj de audio teniendo
 * en cuenta la latencia de salida, para que el clic se oiga en ese instante.
 */
export class Metronome {
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduledUntil = 0;
  volume = 0.6;

  constructor(private readonly ctx: AudioContext) {}

  /** Instante del reloj de audio que se oirá en el instante `perf` de performance.now(). */
  private toAudioTime(perf: number): number {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts?.contextTime !== undefined && ts.performanceTime) {
      return ts.contextTime + (perf - ts.performanceTime) / 1000;
    }
    const latency = (this.ctx.outputLatency || this.ctx.baseLatency || 0) as number;
    return this.ctx.currentTime + (perf - performance.now()) / 1000 - latency;
  }

  private click(at: number, accent: boolean): void {
    const when = Math.max(this.ctx.currentTime, this.toAudioTime(at));
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1175;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(this.volume * (accent ? 1 : 0.6), when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(when);
    osc.stop(when + 0.06);
  }

  start(origin: number, msPerBeat: number, beatsPerBar: number, fromBeat: number): void {
    this.stop();
    this.scheduledUntil = origin + fromBeat * msPerBeat;
    const schedule = () => {
      const horizon = performance.now() + LOOKAHEAD_MS;
      for (const beat of beatsBetween(
        origin,
        msPerBeat,
        beatsPerBar,
        this.scheduledUntil,
        horizon,
      )) {
        this.click(beat.at, beat.accent);
      }
      this.scheduledUntil = Math.max(this.scheduledUntil, horizon);
    };
    schedule();
    this.timer = setInterval(schedule, TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
