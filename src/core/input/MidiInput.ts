import { parseMidiMessage } from './midiMessage';
import { NoteEmitter } from './NoteInput';

/* Subconjunto estructural de la Web MIDI API, para poder inyectar dobles en los tests. */
export type MidiPortLike = {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  state: 'connected' | 'disconnected';
  onmidimessage: ((event: { data: Uint8Array | null; timeStamp: number }) => void) | null;
};

export type MidiAccessLike = {
  inputs: { values(): Iterable<MidiPortLike> };
  onstatechange:
    ((event: { port: { id: string; type: string; state: string } | null }) => void) | null;
};

export type MidiDeviceInfo = { id: string; name: string; manufacturer: string; connected: boolean };

/** Lo que se guarda en ajustes para reconocer el dispositivo en la siguiente sesión. */
export type MidiDeviceRef = { id: string; name: string };

export class MidiAccessError extends Error {
  constructor(
    readonly reason: 'unsupported' | 'denied' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

export function isWebMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
}

export async function requestMidiAccess(): Promise<MidiAccessLike> {
  if (!isWebMidiSupported()) throw new MidiAccessError('unsupported', 'Web MIDI no disponible');
  try {
    return (await navigator.requestMIDIAccess({ sysex: false })) as unknown as MidiAccessLike;
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'SecurityError' || name === 'NotAllowedError') {
      throw new MidiAccessError('denied', String((err as Error).message ?? name));
    }
    throw new MidiAccessError('failed', String((err as Error)?.message ?? err));
  }
}

/** ¿Ya hay permiso concedido? Permite conectar sin pedir un gesto del usuario. */
export async function hasMidiPermission(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'midi' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Entrada MIDI de un único dispositivo seleccionado.
 * Solo reacciona a onstatechange: al desenchufar suelta el puerto y al volver
 * a enchufar el mismo dispositivo (por id o, si cambió, por nombre) se reconecta.
 */
export class MidiInput extends NoteEmitter {
  readonly source = 'midi' as const;
  private wanted: MidiDeviceRef | null = null;
  private port: MidiPortLike | null = null;
  private deviceListeners = new Set<() => void>();

  constructor(private readonly access: MidiAccessLike) {
    super();
    this.access.onstatechange = () => this.handleStateChange();
  }

  listDevices(): MidiDeviceInfo[] {
    return [...this.access.inputs.values()].map((p) => ({
      id: p.id,
      name: p.name || 'Dispositivo MIDI',
      manufacturer: p.manufacturer || '',
      connected: p.state === 'connected',
    }));
  }

  /** Dispositivo realmente conectado ahora mismo, si lo hay. */
  get activeDevice(): MidiDeviceInfo | null {
    if (!this.port) return null;
    return this.listDevices().find((d) => d.id === this.port!.id) ?? null;
  }

  get selection(): MidiDeviceRef | null {
    return this.wanted;
  }

  /** Notifica cambios de lista de dispositivos o de conexión. */
  onDevicesChange(listener: () => void): () => void {
    this.deviceListeners.add(listener);
    return () => this.deviceListeners.delete(listener);
  }

  /** Selecciona un dispositivo. Sin preferencia, usa el primero conectado. */
  select(ref: MidiDeviceRef | null): void {
    this.wanted = ref;
    this.attach();
    this.notify();
  }

  /** Elige el preferido si está; si no, el primero disponible. */
  selectPreferredOrFirst(preferred: MidiDeviceRef | null): void {
    const found = preferred && this.findPort(preferred);
    if (found) return this.select(preferred);
    const first = [...this.access.inputs.values()].find((p) => p.state === 'connected');
    this.select(first ? { id: first.id, name: first.name || '' } : preferred);
  }

  private findPort(ref: MidiDeviceRef): MidiPortLike | null {
    const ports = [...this.access.inputs.values()].filter((p) => p.state === 'connected');
    return (
      ports.find((p) => p.id === ref.id) ??
      ports.find((p) => !!ref.name && p.name === ref.name) ??
      null
    );
  }

  private attach(): void {
    const next = this.wanted ? this.findPort(this.wanted) : null;
    if (next === this.port) return;
    this.detach();
    if (!next) return;
    this.port = next;
    const deviceName = next.name || undefined;
    next.onmidimessage = (event) => {
      const msg = parseMidiMessage(event.data);
      if (msg.type === 'other') return;
      this.emit({
        type: msg.type,
        midi: msg.midi,
        velocity: msg.velocity,
        time: event.timeStamp,
        source: this.source,
        deviceName,
      });
    };
  }

  private detach(): void {
    if (this.port) this.port.onmidimessage = null;
    this.port = null;
  }

  private handleStateChange(): void {
    if (this.port && this.port.state !== 'connected') this.detach();
    if (!this.port) this.attach();
    this.notify();
  }

  private notify(): void {
    this.deviceListeners.forEach((listener) => listener());
  }

  dispose(): void {
    this.detach();
    this.access.onstatechange = null;
    this.deviceListeners.clear();
    super.dispose();
  }
}
