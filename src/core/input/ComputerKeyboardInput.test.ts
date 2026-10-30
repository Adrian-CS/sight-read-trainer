import { describe, expect, it } from 'vitest';
import { ComputerKeyboardInput } from './ComputerKeyboardInput';
import type { NoteEvent } from './NoteInput';

const key = (code: string, extra: Partial<KeyboardEvent> = {}) =>
  ({
    code,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...extra,
  }) as KeyboardEvent;

function setup() {
  const input = new ComputerKeyboardInput(null);
  const events: NoteEvent[] = [];
  input.subscribe((e) => events.push(e));
  return { input, events };
}

describe('ComputerKeyboardInput', () => {
  it('mapea A-W-S-E... a notas desde el Do central', () => {
    const { input, events } = setup();
    for (const code of ['KeyA', 'KeyW', 'KeyS', 'KeyJ', 'KeyK', 'Semicolon']) {
      input.handleKeyDown(key(code));
      input.handleKeyUp(key(code));
    }
    expect(events.filter((e) => e.type === 'noteon').map((e) => e.midi)).toEqual([
      60, 61, 62, 71, 72, 76,
    ]);
  });

  it('ignora la autorrepetición y los atajos con Ctrl', () => {
    const { input, events } = setup();
    input.handleKeyDown(key('KeyA'));
    input.handleKeyDown(key('KeyA', { repeat: true }));
    input.handleKeyDown(key('KeyS', { ctrlKey: true }));
    expect(events).toHaveLength(1);
  });

  it('cambia de octava con Z/X y suelta la nota que sonó', () => {
    const { input, events } = setup();
    input.handleKeyDown(key('KeyA'));
    input.handleKeyDown(key('KeyX'));
    input.handleKeyUp(key('KeyA'));
    input.handleKeyDown(key('KeyA'));
    expect(events.map((e) => [e.type, e.midi])).toEqual([
      ['noteon', 60],
      ['noteoff', 60],
      ['noteon', 72],
    ]);
    input.handleKeyDown(key('KeyZ'));
    input.handleKeyDown(key('KeyZ'));
    expect(input.octaveBase).toBe(48);
  });

  it('no sale del rango MIDI', () => {
    const { input } = setup();
    for (let i = 0; i < 20; i++) input.handleKeyDown(key('KeyX'));
    expect(input.octaveBase + 16).toBeLessThanOrEqual(127);
  });
});
