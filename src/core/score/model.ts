/** Modelo simplificado de una partitura, independiente de OSMD. */

export type ClefSign = 'G' | 'F' | 'C' | 'percussion';

export type Staff = {
  /** Índice global del pentagrama (partes × pentagramas aplanados). */
  index: number;
  partIndex: number;
  /** Número de pentagrama dentro de la parte (1 = superior). */
  staffNumber: number;
  clef: ClefSign;
};

export type ScoreNote = {
  midi: number;
  /** Posición diatónica (octava * 7 + índice de letra) para dibujar en el pentagrama. */
  diatonic: number;
  alter: number;
  staff: number;
  voice: string;
  /** Inicio y duración en negras desde el principio del compás. */
  onset: number;
  duration: number;
  /** Nota de continuación de una ligadura: no se vuelve a tocar. */
  tieStop: boolean;
};

export type ScoreMeasure = {
  index: number;
  /** Número tal como aparece en la partitura (puede no empezar en 1 si hay anacrusa). */
  number: string;
  beats: number;
  beatType: number;
  keyFifths: number;
  /** Duración real en negras (menor que la nominal en anacrusas). */
  length: number;
  notes: ScoreNote[];
};

export type ScoreModel = {
  title: string;
  composer: string;
  staves: Staff[];
  measures: ScoreMeasure[];
  /** Tempo en negras por minuto si la partitura lo indica. */
  tempo: number | null;
};
