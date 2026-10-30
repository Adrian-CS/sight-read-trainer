import { describe, expect, it } from 'vitest';
import { defaultSync, formatMs, fractionInMeasure, measureAtTime, times } from './sync';

const base = { bpm: 120, beatsPerMeasure: 4, startOffsetMs: 1000, marks: {} }; // 2000 ms por compás

describe('times', () => {
  it('sin marcas usa el tempo base desde startOffsetMs', () => {
    expect(times(base, 3)).toEqual([1000, 3000, 5000, 7000]);
  });

  it('interpola linealmente entre anclas', () => {
    const t = times({ ...base, marks: { 4: 11000 } }, 6);
    // compases 1-3 repartidos entre 1000 y 11000 → 2500 ms cada uno
    expect(t.slice(0, 5)).toEqual([1000, 3500, 6000, 8500, 11000]);
    // después de la última ancla, tempo base
    expect(t.slice(5)).toEqual([13000, 15000]);
  });

  it('ordena marcas y permite marcar el compás 0', () => {
    const t = times({ ...base, marks: { 2: 6000, 0: 500, 1: 2000 } }, 3);
    expect(t).toEqual([500, 2000, 6000, 8000]);
  });
});

describe('measureAtTime', () => {
  const t = times(base, 3);
  it('localiza el compás que suena', () => {
    expect(measureAtTime(t, 999)).toBe(-1);
    expect(measureAtTime(t, 1000)).toBe(0);
    expect(measureAtTime(t, 2999)).toBe(0);
    expect(measureAtTime(t, 3000)).toBe(1);
    expect(measureAtTime(t, 6999)).toBe(2);
    expect(measureAtTime(t, 7000)).toBe(3); // terminado
  });
});

describe('fractionInMeasure', () => {
  const t = times(base, 3);
  it('interpola dentro del compás y recorta a 0-1', () => {
    expect(fractionInMeasure(t, 1, 4000)).toBe(0.5);
    expect(fractionInMeasure(t, 1, 0)).toBe(0);
    expect(fractionInMeasure(t, 1, 99999)).toBe(1);
    expect(fractionInMeasure(t, 5, 4000)).toBe(0);
  });
});

describe('utilidades', () => {
  it('formatea tiempos', () => {
    expect(formatMs(0)).toBe('0:00.0');
    expect(formatMs(65340)).toBe('1:05.3');
  });

  it('calcula la sincronización por defecto en negras', () => {
    expect(defaultSync({ tempo: null, beats: 6, beatType: 8 })).toMatchObject({
      bpm: 100,
      beatsPerMeasure: 3,
    });
  });
});
