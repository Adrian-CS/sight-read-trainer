/**
 * Genera MusicXML a partir de una notación compacta. Lo usan las piezas de ejemplo
 * y lo usarán los generadores de ejercicios (mismo pipeline de render que las importadas).
 *
 * Cada compás es una cadena de figuras separadas por espacios:
 *   "C4:q"        negra de Do4        (w h q e s = redonda, blanca, negra, corchea, semicorchea)
 *   "F#4:h."      blanca con puntillo de Fa♯4 (b = bemol: "Bb3:q")
 *   "C3+E3+G3:w"  acorde
 *   "r:q"         silencio
 */

const DIVISIONS = 4; // divisiones por negra: semicorchea = 1
const DURATIONS: Record<string, { divisions: number; type: string }> = {
  w: { divisions: 16, type: 'whole' },
  h: { divisions: 8, type: 'half' },
  q: { divisions: 4, type: 'quarter' },
  e: { divisions: 2, type: 'eighth' },
  s: { divisions: 1, type: '16th' },
};

export type BuildScoreInput = {
  title: string;
  composer?: string;
  beats: number;
  beatType: number;
  /** Armadura: número de sostenidos (positivo) o bemoles (negativo). */
  keyFifths: number;
  tempo?: number;
  /** Mano derecha, clave de Sol. Un elemento por compás. */
  right: string[];
  /** Mano izquierda, clave de Fa. Omitir para un solo pentagrama. */
  left?: string[];
};

type Token = {
  pitches: { step: string; alter: number; octave: number }[];
  divisions: number;
  type: string;
  dot: boolean;
};

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function parseToken(token: string): Token {
  const match = /^([^:]+):([whqes])(\.?)$/.exec(token);
  if (!match) throw new Error(`Figura no válida: "${token}"`);
  const [, notes, dur, dot] = match;
  const base = DURATIONS[dur];
  const pitches =
    notes === 'r'
      ? []
      : notes.split('+').map((p) => {
          const m = /^([A-G])(#|b)?(-?\d)$/.exec(p);
          if (!m) throw new Error(`Nota no válida: "${p}"`);
          return {
            step: m[1],
            alter: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0,
            octave: Number(m[3]),
          };
        });
  return {
    pitches,
    divisions: dot ? (base.divisions * 3) / 2 : base.divisions,
    type: base.type,
    dot: !!dot,
  };
}

function noteXml(token: Token, staff: number, voice: number, multiStaff: boolean): string {
  const tail =
    `<duration>${token.divisions}</duration><voice>${voice}</voice><type>${token.type}</type>` +
    (token.dot ? '<dot/>' : '') +
    (multiStaff ? `<staff>${staff}</staff>` : '');
  if (token.pitches.length === 0) return `<note><rest/>${tail}</note>`;
  return token.pitches
    .map((p, i) => {
      const alter = p.alter ? `<alter>${p.alter}</alter>` : '';
      return `<note>${i > 0 ? '<chord/>' : ''}<pitch><step>${p.step}</step>${alter}<octave>${p.octave}</octave></pitch>${tail}</note>`;
    })
    .join('');
}

function voiceXml(
  measure: string,
  staff: number,
  voice: number,
  multiStaff: boolean,
  expected: number,
  label: string,
) {
  const tokens = measure.trim().split(/\s+/).filter(Boolean).map(parseToken);
  const total = tokens.reduce((sum, t) => sum + t.divisions, 0);
  if (total !== expected) {
    throw new Error(
      `${label}: dura ${total / DIVISIONS} negras, se esperaban ${expected / DIVISIONS}`,
    );
  }
  return tokens.map((t) => noteXml(t, staff, voice, multiStaff)).join('');
}

export function buildMusicXml(input: BuildScoreInput): string {
  const { right, left } = input;
  if (left && left.length !== right.length)
    throw new Error('Las dos manos deben tener los mismos compases');
  const multiStaff = !!left;
  const measureDivisions = (input.beats * 4 * DIVISIONS) / input.beatType;

  const measures = right.map((rh, i) => {
    let xml = `<measure number="${i + 1}">`;
    if (i === 0) {
      xml +=
        `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${input.keyFifths}</fifths></key>` +
        `<time><beats>${input.beats}</beats><beat-type>${input.beatType}</beat-type></time>` +
        (multiStaff ? '<staves>2</staves>' : '') +
        `<clef number="1"><sign>G</sign><line>2</line></clef>` +
        (multiStaff ? `<clef number="2"><sign>F</sign><line>4</line></clef>` : '') +
        `</attributes>`;
      if (input.tempo) {
        xml +=
          `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>` +
          `<per-minute>${input.tempo}</per-minute></metronome></direction-type><sound tempo="${input.tempo}"/></direction>`;
      }
    }
    xml += voiceXml(rh, 1, 1, multiStaff, measureDivisions, `Compás ${i + 1} (derecha)`);
    if (left) {
      xml += `<backup><duration>${measureDivisions}</duration></backup>`;
      xml += voiceXml(left[i], 2, 5, multiStaff, measureDivisions, `Compás ${i + 1} (izquierda)`);
    }
    if (i === right.length - 1)
      xml += '<barline location="right"><bar-style>light-heavy</bar-style></barline>';
    return xml + '</measure>';
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n` +
    `<score-partwise version="4.0">` +
    `<work><work-title>${escapeXml(input.title)}</work-title></work>` +
    (input.composer
      ? `<identification><creator type="composer">${escapeXml(input.composer)}</creator></identification>`
      : '') +
    `<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>` +
    `<part id="P1">${measures.join('')}</part></score-partwise>\n`
  );
}
