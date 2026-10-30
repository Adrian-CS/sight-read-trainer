import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DexieRepository } from './DexieRepository';
import { DEFAULT_SETTINGS, type Piece } from './types';

let repo: DexieRepository;
let n = 0;
const fresh = () => (repo = new DexieRepository(`test-${n++}`));

afterEach(() => repo?.close());

const piece = (id: string, createdAt: number): Piece => ({
  id,
  title: `Pieza ${id}`,
  musicXml: '<score-partwise/>',
  createdAt,
  hand: 'both',
});

describe('DexieRepository', () => {
  it('devuelve ajustes por defecto y guarda cambios parciales', async () => {
    fresh();
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
    const updated = await repo.updateSettings({ midiDevice: { id: 'a', name: 'Digital Piano' } });
    expect(updated.midiDevice).toEqual({ id: 'a', name: 'Digital Piano' });
    expect(updated.chordWindowMs).toBe(150);
  });

  it('lista piezas de más reciente a más antigua y borra sus intentos', async () => {
    fresh();
    await repo.savePiece(piece('1', 10));
    await repo.savePiece(piece('2', 20));
    await repo.addAttempt({ id: 'x', pieceId: '1', date: 1, accuracy: 1, durationMs: 1000 });
    expect((await repo.listPieces()).map((p) => p.id)).toEqual(['2', '1']);

    await repo.deletePiece('1');
    expect((await repo.listPieces()).map((p) => p.id)).toEqual(['2']);
    expect(await repo.listAttempts({ pieceId: '1' })).toEqual([]);
  });

  it('guarda estadísticas por nota y clave', async () => {
    fresh();
    const stat = {
      midi: 60,
      clef: 'treble' as const,
      attempts: 3,
      errors: 1,
      avgReactionMs: 800,
      lastSeen: 5,
    };
    await repo.putNoteStat(stat);
    expect(await repo.getNoteStat(60, 'treble')).toEqual(stat);
    expect(await repo.getNoteStat(60, 'bass')).toBeUndefined();
  });
});
