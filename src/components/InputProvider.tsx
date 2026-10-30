'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CompositeInput,
  ComputerKeyboardInput,
  MidiAccessError,
  MidiInput,
  OnScreenKeyboardInput,
  hasMidiPermission,
  isWebMidiSupported,
  requestMidiAccess,
  type MidiDeviceInfo,
  type MidiDeviceRef,
  type NoteInput,
  type NoteListener,
} from '@/core/input';
import { getRepository } from '@/core/storage/client';

export type MidiState =
  | { status: 'unsupported' }
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'denied' }
  | { status: 'failed'; message: string }
  | {
      status: 'ready';
      devices: MidiDeviceInfo[];
      selection: MidiDeviceRef | null;
      active: MidiDeviceInfo | null;
    };

type InputContextValue = {
  /** Todas las entradas combinadas. Es lo único que debería usar la lógica de práctica. */
  input: NoteInput;
  onScreen: OnScreenKeyboardInput;
  computer: ComputerKeyboardInput | null;
  midi: MidiState;
  connectMidi: () => Promise<void>;
  selectMidiDevice: (id: string) => void;
};

const InputContext = createContext<InputContextValue | null>(null);

type Inputs = {
  all: CompositeInput;
  onScreen: OnScreenKeyboardInput;
  computer: ComputerKeyboardInput | null;
};

export function InputProvider({ children }: { children: ReactNode }) {
  const [inputs, setInputs] = useState<Inputs | null>(null);
  const midiRef = useRef<MidiInput | null>(null);
  const [midi, setMidi] = useState<MidiState>({ status: 'idle' });

  useEffect(() => {
    const onScreen = new OnScreenKeyboardInput();
    const computer = new ComputerKeyboardInput(window);
    const all = new CompositeInput([onScreen, computer]);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- las entradas dependen de window
    setInputs({ all, onScreen, computer });
    return () => {
      midiRef.current = null;
      all.dispose();
    };
  }, []);

  const refreshMidi = useCallback(() => {
    const m = midiRef.current;
    if (!m) return;
    setMidi({
      status: 'ready',
      devices: m.listDevices(),
      selection: m.selection,
      active: m.activeDevice,
    });
  }, []);

  const connectMidi = useCallback(async () => {
    if (!inputs || midiRef.current) return;
    if (!isWebMidiSupported()) return setMidi({ status: 'unsupported' });
    setMidi({ status: 'requesting' });
    try {
      const access = await requestMidiAccess();
      const m = new MidiInput(access);
      midiRef.current = m;
      inputs.all.add(m);
      m.onDevicesChange(refreshMidi);
      const settings = await getRepository().getSettings();
      m.selectPreferredOrFirst(settings.midiDevice);
      if (m.selection) void getRepository().updateSettings({ midiDevice: m.selection });
      refreshMidi();
    } catch (err) {
      if (err instanceof MidiAccessError && err.reason === 'unsupported')
        setMidi({ status: 'unsupported' });
      else if (err instanceof MidiAccessError && err.reason === 'denied')
        setMidi({ status: 'denied' });
      else setMidi({ status: 'failed', message: (err as Error).message });
    }
  }, [inputs, refreshMidi]);

  // Si el permiso ya estaba concedido, conectar sin esperar un toque.
  useEffect(() => {
    if (!inputs) return;
    if (!isWebMidiSupported()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- detección de capacidad del navegador
      setMidi({ status: 'unsupported' });
      return;
    }
    void hasMidiPermission().then((granted) => {
      if (granted) void connectMidi();
    });
  }, [inputs, connectMidi]);

  const selectMidiDevice = useCallback((id: string) => {
    const m = midiRef.current;
    const device = m?.listDevices().find((d) => d.id === id);
    if (!m || !device) return;
    const ref = { id: device.id, name: device.name };
    m.select(ref);
    void getRepository().updateSettings({ midiDevice: ref });
  }, []);

  if (!inputs) return null;

  return (
    <InputContext.Provider
      value={{
        input: inputs.all,
        onScreen: inputs.onScreen,
        computer: inputs.computer,
        midi,
        connectMidi,
        selectMidiDevice,
      }}
    >
      {children}
    </InputContext.Provider>
  );
}

export function useInput(): InputContextValue {
  const ctx = useContext(InputContext);
  if (!ctx) throw new Error('useInput debe usarse dentro de <InputProvider>');
  return ctx;
}

/** Se suscribe a las notas de todas las entradas mientras el componente está montado. */
export function useNoteEvents(listener: NoteListener): void {
  const { input } = useInput();
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => input.subscribe((e) => ref.current(e)), [input]);
}
