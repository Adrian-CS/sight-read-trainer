import { describe, expect, it } from 'vitest';
import { parseMidiMessage } from './midiMessage';

describe('parseMidiMessage', () => {
  it('interpreta Note On en cualquier canal', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({
      type: 'noteon',
      channel: 0,
      midi: 60,
      velocity: 100,
    });
    expect(parseMidiMessage([0x93, 64, 1])).toMatchObject({ type: 'noteon', channel: 3, midi: 64 });
  });

  it('trata Note On con velocidad 0 como Note Off', () => {
    expect(parseMidiMessage([0x90, 60, 0])).toMatchObject({ type: 'noteoff', midi: 60 });
  });

  it('interpreta Note Off', () => {
    expect(parseMidiMessage([0x80, 60, 64])).toMatchObject({
      type: 'noteoff',
      midi: 60,
      velocity: 64,
    });
  });

  it('ignora otros mensajes y datos incompletos', () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toEqual({ type: 'other' }); // pedal sustain
    expect(parseMidiMessage([0xfe])).toEqual({ type: 'other' }); // active sensing
    expect(parseMidiMessage(null)).toEqual({ type: 'other' });
  });
});
