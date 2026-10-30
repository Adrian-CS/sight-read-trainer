import { describe, expect, it } from 'vitest';
import type { ScoreMeasure } from './model';
import { keyAlterations, miniStaffNotes } from './miniStaff';

const measure = (notes: Partial<ScoreMeasure['notes'][number]>[], keyFifths = 0): ScoreMeasure => ({
  index: 0,
  number: '1',
  beats: 4,
  beatType: 4,
  keyFifths,
  length: 4,
  notes: notes.map((n) => ({
    midi: 60,
    diatonic: 28,
    alter: 0,
    staff: 0,
    voice: '1',
    onset: 0,
    duration: 1,
    tieStop: false,
    ...n,
  })),
});

describe('miniStaffNotes', () => {
  it('coloca el Do central con línea adicional en clave de Sol', () => {
    const [c4] = miniStaffNotes(measure([{ diatonic: 28 }]), 0, 'G');
    expect(c4).toMatchObject({ step: -2, ledgers: [-2], accidental: null, hollow: false });
  });

  it('coloca Sol2 en la línea inferior de la clave de Fa', () => {
    const [g2] = miniStaffNotes(measure([{ diatonic: 2 * 7 + 4, duration: 2, onset: 2 }]), 0, 'F');
    expect(g2).toMatchObject({ step: 0, ledgers: [], hollow: true, x: 0.5 });
  });

  it('omite las alteraciones de la armadura y muestra las demás', () => {
    const fSharp = { diatonic: 4 * 7 + 3, alter: 1 };
    expect(miniStaffNotes(measure([fSharp], 1), 0, 'G')[0].accidental).toBeNull();
    expect(miniStaffNotes(measure([fSharp], 0), 0, 'G')[0].accidental).toBe('♯');
    expect(miniStaffNotes(measure([{ diatonic: 4 * 7 + 3 }], 1), 0, 'G')[0].accidental).toBe('♮');
  });

  it('calcula armaduras', () => {
    expect(keyAlterations(2)).toEqual([1, 0, 0, 1, 0, 0, 0]); // Fa♯ Do♯
    expect(keyAlterations(-1)).toEqual([0, 0, 0, 0, 0, 0, -1]); // Si♭
  });
});
