import { describe, expect, it } from 'vitest';
import { CompositeInput } from './CompositeInput';
import type { NoteEvent } from './NoteInput';
import { OnScreenKeyboardInput } from './OnScreenKeyboardInput';

describe('OnScreenKeyboardInput + CompositeInput', () => {
  it('emite press/release una sola vez y llega por la entrada combinada', () => {
    const screen = new OnScreenKeyboardInput();
    const all = new CompositeInput([screen]);
    const events: NoteEvent[] = [];
    all.subscribe((e) => events.push(e));

    screen.press(64);
    screen.press(64);
    screen.release(64);
    screen.release(64);

    expect(events.map((e) => [e.type, e.midi, e.source])).toEqual([
      ['noteon', 64, 'onscreen'],
      ['noteoff', 64, 'onscreen'],
    ]);
  });
});
