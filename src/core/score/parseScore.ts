import type { ClefSign, ScoreMeasure, ScoreModel, ScoreNote, Staff } from './model';

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

type El = Element;

function children(el: El, name?: string): El[] {
  const out: El[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (!name || (n as El).nodeName === name)) out.push(n as El);
  }
  return out;
}

function child(el: El | undefined, name: string): El | undefined {
  return el ? children(el, name)[0] : undefined;
}

function text(el: El | undefined, name: string): string | undefined {
  const c = child(el, name);
  return c?.textContent?.trim() || undefined;
}

function num(el: El | undefined, name: string): number | undefined {
  const value = text(el, name);
  return value === undefined ? undefined : Number(value);
}

export function pitchToMidi(step: string, alter: number, octave: number): number {
  return (octave + 1) * 12 + STEP_SEMITONES[STEPS.indexOf(step)] + alter;
}

function titleOf(root: El): string {
  const work = text(child(root, 'work'), 'work-title');
  const movement = text(root, 'movement-title');
  if (work || movement) return (work ?? movement)!;
  // Algunos exportadores solo ponen el título en <credit>.
  for (const credit of children(root, 'credit')) {
    if (text(credit, 'credit-type') === 'title') return text(credit, 'credit-words') ?? '';
  }
  return '';
}

function composerOf(root: El): string {
  const identification = child(root, 'identification');
  if (!identification) return '';
  const creators = children(identification, 'creator');
  const composer = creators.find((c) => c.getAttribute('type') === 'composer') ?? creators[0];
  return composer?.textContent?.trim() ?? '';
}

/** Extrae compases, pentagramas y notas de un documento MusicXML partwise. */
export function parseScore(doc: Document): ScoreModel {
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'score-partwise') throw new Error('Se esperaba <score-partwise>');

  const staves: Staff[] = [];
  const measures: ScoreMeasure[] = [];
  let tempo: number | null = null;

  children(root, 'part').forEach((part, partIndex) => {
    let divisions = 1;
    let beats = 4;
    let beatType = 4;
    let keyFifths = 0;
    let staffCount = 1;
    const firstStaff = staves.length;
    const clefs = new Map<number, ClefSign>();

    children(part, 'measure').forEach((measureEl, index) => {
      let time = 0;
      let maxTime = 0;
      let lastOnset = 0;
      const notes: ScoreNote[] = [];

      for (const el of children(measureEl)) {
        if (el.nodeName === 'attributes') {
          divisions = num(el, 'divisions') ?? divisions;
          staffCount = num(el, 'staves') ?? staffCount;
          const key = child(el, 'key');
          if (key) keyFifths = num(key, 'fifths') ?? keyFifths;
          const timeEl = child(el, 'time');
          if (timeEl) {
            // Compases compuestos tipo "3+2" se suman.
            beats = (text(timeEl, 'beats') ?? '4').split('+').reduce((a, b) => a + Number(b), 0);
            beatType = num(timeEl, 'beat-type') ?? beatType;
          }
          for (const clef of children(el, 'clef')) {
            const sign = text(clef, 'sign');
            const n = Number(clef.getAttribute('number') ?? 1);
            if (clefs.has(n)) continue; // nos quedamos con la clave inicial
            if (sign === 'G' || sign === 'F' || sign === 'C') clefs.set(n, sign);
            else if (sign === 'percussion') clefs.set(n, 'percussion');
          }
        } else if (el.nodeName === 'backup') {
          time -= num(el, 'duration') ?? 0;
        } else if (el.nodeName === 'forward') {
          time += num(el, 'duration') ?? 0;
          maxTime = Math.max(maxTime, time);
        } else if (el.nodeName === 'direction' || el.nodeName === 'sound') {
          const sound = el.nodeName === 'sound' ? el : child(el, 'sound');
          const t = sound?.getAttribute('tempo');
          if (tempo === null && t) tempo = Number(t);
        } else if (el.nodeName === 'note') {
          if (child(el, 'grace') || child(el, 'cue')) continue;
          const duration = num(el, 'duration') ?? 0;
          const isChord = !!child(el, 'chord');
          const onset = isChord ? lastOnset : time;
          if (!isChord) {
            lastOnset = time;
            time += duration;
            maxTime = Math.max(maxTime, time);
          }
          const pitch = child(el, 'pitch');
          if (!pitch) continue; // silencio o nota sin altura
          const step = text(pitch, 'step') ?? 'C';
          const alter = num(pitch, 'alter') ?? 0;
          const octave = num(pitch, 'octave') ?? 4;
          const staffNumber = num(el, 'staff') ?? 1;
          notes.push({
            midi: pitchToMidi(step, Math.round(alter), octave),
            diatonic: octave * 7 + STEPS.indexOf(step),
            alter,
            staff: firstStaff + staffNumber - 1,
            voice: text(el, 'voice') ?? '1',
            onset: onset / divisions,
            duration: duration / divisions,
            tieStop: children(el, 'tie').some((t) => t.getAttribute('type') === 'stop'),
          });
        }
      }

      const length = maxTime / divisions;
      const existing = measures[index];
      if (existing) {
        existing.notes.push(...notes);
        existing.length = Math.max(existing.length, length);
      } else {
        measures[index] = {
          index,
          number: measureEl.getAttribute('number') ?? String(index + 1),
          beats,
          beatType,
          keyFifths,
          length,
          notes,
        };
      }
    });

    for (let n = 1; n <= staffCount; n++) {
      staves.push({
        index: firstStaff + n - 1,
        partIndex,
        staffNumber: n,
        clef: clefs.get(n) ?? 'G',
      });
    }
  });

  for (const m of measures) m.notes.sort((a, b) => a.onset - b.onset || a.midi - b.midi);

  return { title: titleOf(root), composer: composerOf(root), staves, measures, tempo };
}
