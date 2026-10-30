import { describe, expect, it, vi } from 'vitest';
import { MidiInput, type MidiAccessLike, type MidiPortLike } from './MidiInput';
import type { NoteEvent } from './NoteInput';

function fakePort(id: string, name: string): MidiPortLike {
  return { id, name, manufacturer: 'Yamaha', state: 'connected', onmidimessage: null };
}

function fakeAccess(ports: MidiPortLike[]) {
  const map = new Map(ports.map((p) => [p.id, p]));
  const access: MidiAccessLike = { inputs: { values: () => map.values() }, onstatechange: null };
  return {
    access,
    plug(port: MidiPortLike) {
      port.state = 'connected';
      map.set(port.id, port);
      access.onstatechange?.({ port: { id: port.id, type: 'input', state: 'connected' } });
    },
    unplug(port: MidiPortLike) {
      port.state = 'disconnected';
      access.onstatechange?.({ port: { id: port.id, type: 'input', state: 'disconnected' } });
    },
  };
}

function send(port: MidiPortLike, data: number[], timeStamp = 0) {
  port.onmidimessage?.({ data: new Uint8Array(data), timeStamp });
}

describe('MidiInput', () => {
  it('emite eventos del dispositivo seleccionado', () => {
    const piano = fakePort('a', 'Digital Piano');
    const { access } = fakeAccess([piano]);
    const input = new MidiInput(access);
    const events: NoteEvent[] = [];
    input.subscribe((e) => events.push(e));
    input.selectPreferredOrFirst(null);

    send(piano, [0x90, 60, 80], 12.5);
    send(piano, [0x80, 60, 0], 20);

    expect(events).toEqual([
      {
        type: 'noteon',
        midi: 60,
        velocity: 80,
        time: 12.5,
        source: 'midi',
        deviceName: 'Digital Piano',
      },
      {
        type: 'noteoff',
        midi: 60,
        velocity: 0,
        time: 20,
        source: 'midi',
        deviceName: 'Digital Piano',
      },
    ]);
    expect(input.activeDevice?.name).toBe('Digital Piano');
  });

  it('respeta la preferencia guardada', () => {
    const other = fakePort('x', 'Otro');
    const piano = fakePort('a', 'Digital Piano');
    const { access } = fakeAccess([other, piano]);
    const input = new MidiInput(access);
    input.selectPreferredOrFirst({ id: 'a', name: 'Digital Piano' });
    expect(input.activeDevice?.id).toBe('a');
    expect(other.onmidimessage).toBeNull();
  });

  it('se desconecta al desenchufar y se reconecta al enchufar, aunque cambie el id', () => {
    const piano = fakePort('a', 'Digital Piano');
    const fake = fakeAccess([piano]);
    const input = new MidiInput(fake.access);
    const onChange = vi.fn();
    input.onDevicesChange(onChange);
    input.selectPreferredOrFirst(null);

    fake.unplug(piano);
    expect(input.activeDevice).toBeNull();
    expect(piano.onmidimessage).toBeNull();

    const replugged = fakePort('b', 'Digital Piano');
    fake.plug(replugged);
    expect(input.activeDevice?.id).toBe('b');

    const events: NoteEvent[] = [];
    input.subscribe((e) => events.push(e));
    send(replugged, [0x90, 62, 70]);
    expect(events.map((e) => e.midi)).toEqual([62]);
    expect(onChange).toHaveBeenCalled();
  });

  it('no se engancha a otro dispositivo distinto del elegido', () => {
    const piano = fakePort('a', 'Digital Piano');
    const fake = fakeAccess([piano]);
    const input = new MidiInput(fake.access);
    input.selectPreferredOrFirst(null);
    fake.unplug(piano);
    fake.plug(fakePort('z', 'Controlador'));
    expect(input.activeDevice).toBeNull();
  });
});
