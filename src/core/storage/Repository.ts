import type { Attempt, Clef, NoteStat, Piece, Settings } from './types';

/**
 * Capa de datos abstracta. La implementación actual es local (Dexie/IndexedDB);
 * más adelante se puede añadir una que sincronice con Cloudflare D1.
 */
export interface Repository {
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  listPieces(): Promise<Piece[]>;
  getPiece(id: string): Promise<Piece | undefined>;
  savePiece(piece: Piece): Promise<void>;
  deletePiece(id: string): Promise<void>;

  addAttempt(attempt: Attempt): Promise<void>;
  listAttempts(filter?: { pieceId?: string; exerciseId?: string }): Promise<Attempt[]>;

  getNoteStat(midi: number, clef: Clef): Promise<NoteStat | undefined>;
  putNoteStat(stat: NoteStat): Promise<void>;
  listNoteStats(): Promise<NoteStat[]>;
}
