import type { TempoSummary } from '../practice/tempoMode';
import type { StepOutcome } from '../practice/waitMode';
import type { Repository } from '../storage/Repository';
import type { CourseProgress } from '../storage/types';
import { noteExerciseXml } from './generator';
import {
  chordItems,
  HARMONY_PER_MEASURE,
  harmonyExerciseXml,
  intervalItems,
  pickItems,
} from './harmony';
import { evaluateRhythm, evaluateSession, UNLOCK_HARMONY_REACTION_MS } from './progression';
import type { Rng } from './random';
import { rhythmExercise } from './rhythm';
import { pickNotes } from './spaced';
import {
  currentLevel,
  isLevelTrack,
  LEVEL_COUNTS,
  nextNote,
  TRACK_IDS,
  trackPool,
  unlockedCount,
  type NoteTrackId,
  type PoolNote,
  type TrackId,
} from './tracks';

export const EXERCISE_LENGTH = 16; // notas sueltas: 4 compases de negras
export const HARMONY_LENGTH = 8; // intervalos y acordes: 4 compases de blancas
export const RHYTHM_MEASURES = 4;

export type ProgressMap = Partial<Record<TrackId, CourseProgress>>;

export async function loadProgress(repo: Repository): Promise<ProgressMap> {
  const rows = await repo.listCourseProgress();
  return Object.fromEntries(
    rows.filter((r) => (TRACK_IDS as string[]).includes(r.trackId)).map((r) => [r.trackId, r]),
  ) as ProgressMap;
}

export type Exercise = {
  trackId: TrackId;
  xml: string;
  /** Ritmo se toca con metrónomo; lo demás, en modo espera. */
  mode: 'wait' | 'tempo';
  /** Nivel con el que se generó (pistas por niveles). */
  level?: number;
  /** Nombre de lo que suena en cada instante, con clave "compás:inicio" (intervalos y acordes). */
  names?: Record<string, string>;
  /** Notas del ejercicio (pistas de notas sueltas). */
  sequence?: PoolNote[];
};

export const stepKey = (measure: number, onset: number) => `${measure}:${onset}`;

function harmonyExercise(trackId: 'intervals' | 'chords', level: number, rng: Rng): Exercise {
  const items = trackId === 'intervals' ? intervalItems(level) : chordItems(level);
  const previous =
    level > 1 ? (trackId === 'intervals' ? intervalItems(level - 1) : chordItems(level - 1)) : [];
  const newest = items.filter((i) => !previous.some((p) => p.id === i.id));
  const sequence = pickItems(items, HARMONY_LENGTH, rng, level > 1 ? newest : []);
  const names: Record<string, string> = {};
  sequence.forEach((item, i) => {
    names[stepKey(Math.floor(i / HARMONY_PER_MEASURE), (i % HARMONY_PER_MEASURE) * 2)] = item.name;
  });
  return { trackId, xml: harmonyExerciseXml(sequence), mode: 'wait', level, names };
}

/** Genera un ejercicio nuevo de la pista según el progreso guardado. */
export async function createExercise(
  repo: Repository,
  trackId: TrackId,
  rng: Rng = Math.random,
): Promise<Exercise> {
  const progress = await loadProgress(repo);
  if (trackId === 'rhythm') {
    const level = currentLevel('rhythm', progress.rhythm);
    return { trackId, xml: rhythmExercise(level, RHYTHM_MEASURES, rng).xml, mode: 'tempo', level };
  }
  if (trackId === 'intervals' || trackId === 'chords') {
    return harmonyExercise(trackId, currentLevel(trackId, progress[trackId]), rng);
  }
  const stats = await repo.listNoteStats();
  const sequence = pickNotes(trackPool(trackId, progress), stats, EXERCISE_LENGTH, rng);
  return { trackId, xml: noteExerciseXml(trackId, sequence), mode: 'wait', sequence };
}

export type Unlock = { kind: 'note'; midi: number } | { kind: 'level'; level: number } | null;

export type SessionOutcome = {
  passed: boolean;
  accuracy: number;
  medianReactionMs?: number;
  meanAbsDeltaMs?: number;
  unlocked: Unlock;
};

async function unlockNext(repo: Repository, trackId: TrackId): Promise<Unlock> {
  const progress = (await loadProgress(repo))[trackId];
  if (isLevelTrack(trackId)) {
    const level = currentLevel(trackId, progress);
    if (level >= LEVEL_COUNTS[trackId]) return null;
    await repo.putCourseProgress({ trackId, unlocked: level + 1, updatedAt: Date.now() });
    return { kind: 'level', level: level + 1 };
  }
  if (trackId === 'both') return null; // mezcla lo desbloqueado en Sol y Fa
  const note = nextNote(trackId, progress);
  if (!note) return null;
  await repo.putCourseProgress({
    trackId,
    unlocked: unlockedCount(trackId, progress) + 1,
    updatedAt: Date.now(),
  });
  return { kind: 'note', midi: note.midi };
}

/** Tras un ejercicio completo en modo espera: si se superan los umbrales, desbloquea lo siguiente. */
export async function completeExercise(
  repo: Repository,
  trackId: NoteTrackId | 'intervals' | 'chords',
  outcomes: StepOutcome[],
): Promise<SessionOutcome> {
  const limit =
    trackId === 'intervals' || trackId === 'chords' ? UNLOCK_HARMONY_REACTION_MS : undefined;
  const result = evaluateSession(outcomes, limit);
  return { ...result, unlocked: result.passed ? await unlockNext(repo, trackId) : null };
}

/** Tras un ejercicio de ritmo completo. */
export async function completeRhythmExercise(
  repo: Repository,
  summary: TempoSummary,
): Promise<SessionOutcome> {
  const result = evaluateRhythm(summary);
  return { ...result, unlocked: result.passed ? await unlockNext(repo, 'rhythm') : null };
}
