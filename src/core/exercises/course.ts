import type { StepOutcome } from '../practice/waitMode';
import type { Repository } from '../storage/Repository';
import type { CourseProgress } from '../storage/types';
import { noteExerciseXml } from './generator';
import { evaluateSession, type SessionResult } from './progression';
import type { Rng } from './random';
import { pickNotes } from './spaced';
import {
  TRACK_IDS,
  nextNote,
  trackPool,
  unlockedCount,
  type PoolNote,
  type TrackId,
} from './tracks';

export const EXERCISE_LENGTH = 16; // 4 compases de negras

export type ProgressMap = Partial<Record<TrackId, CourseProgress>>;

export async function loadProgress(repo: Repository): Promise<ProgressMap> {
  const rows = await repo.listCourseProgress();
  return Object.fromEntries(
    rows.filter((r) => (TRACK_IDS as string[]).includes(r.trackId)).map((r) => [r.trackId, r]),
  ) as ProgressMap;
}

export type Exercise = { trackId: TrackId; sequence: PoolNote[]; xml: string };

/** Genera un ejercicio nuevo priorizando las notas con más fallos o más lentas. */
export async function createExercise(
  repo: Repository,
  trackId: TrackId,
  rng: Rng = Math.random,
): Promise<Exercise> {
  const [progress, stats] = await Promise.all([loadProgress(repo), repo.listNoteStats()]);
  const sequence = pickNotes(trackPool(trackId, progress), stats, EXERCISE_LENGTH, rng);
  return { trackId, sequence, xml: noteExerciseXml(trackId, sequence) };
}

export type SessionOutcome = SessionResult & { unlocked: PoolNote | null };

/** Tras un ejercicio completo: si se superan los umbrales, desbloquea la siguiente nota de la pista. */
export async function completeExercise(
  repo: Repository,
  trackId: TrackId,
  outcomes: StepOutcome[],
): Promise<SessionOutcome> {
  const result = evaluateSession(outcomes);
  if (!result.passed || trackId === 'both') return { ...result, unlocked: null };
  const progress = (await loadProgress(repo))[trackId];
  const note = nextNote(trackId, progress);
  if (!note) return { ...result, unlocked: null };
  await repo.putCourseProgress({
    trackId,
    unlocked: unlockedCount(trackId, progress) + 1,
    updatedAt: Date.now(),
  });
  return { ...result, unlocked: note };
}
