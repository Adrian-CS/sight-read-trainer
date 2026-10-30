import Dexie, { type EntityTable } from 'dexie';
import type { Repository } from './Repository';
import {
  DEFAULT_SETTINGS,
  type Attempt,
  type Clef,
  type NoteStat,
  type Piece,
  type Settings,
} from './types';

type SettingRow = { key: keyof Settings; value: unknown };

class SightreadDB extends Dexie {
  pieces!: EntityTable<Piece, 'id'>;
  attempts!: EntityTable<Attempt, 'id'>;
  noteStats!: Dexie.Table<NoteStat, [number, Clef]>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      pieces: 'id, title, createdAt',
      attempts: 'id, pieceId, exerciseId, date',
      noteStats: '[midi+clef], lastSeen',
      settings: 'key',
    });
  }
}

export class DexieRepository implements Repository {
  private readonly db: SightreadDB;

  constructor(name = 'sightread-trainer') {
    this.db = new SightreadDB(name);
  }

  async getSettings(): Promise<Settings> {
    const rows = await this.db.settings.toArray();
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const rows = Object.entries(patch).map(([key, value]) => ({
      key: key as keyof Settings,
      value,
    }));
    await this.db.settings.bulkPut(rows);
    return this.getSettings();
  }

  listPieces(): Promise<Piece[]> {
    return this.db.pieces.orderBy('createdAt').reverse().toArray();
  }

  getPiece(id: string): Promise<Piece | undefined> {
    return this.db.pieces.get(id);
  }

  async savePiece(piece: Piece): Promise<void> {
    await this.db.pieces.put(piece);
  }

  async deletePiece(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.pieces, this.db.attempts, async () => {
      await this.db.pieces.delete(id);
      await this.db.attempts.where('pieceId').equals(id).delete();
    });
  }

  async addAttempt(attempt: Attempt): Promise<void> {
    await this.db.attempts.add(attempt);
  }

  listAttempts(filter: { pieceId?: string; exerciseId?: string } = {}): Promise<Attempt[]> {
    if (filter.pieceId)
      return this.db.attempts.where('pieceId').equals(filter.pieceId).sortBy('date');
    if (filter.exerciseId) {
      return this.db.attempts.where('exerciseId').equals(filter.exerciseId).sortBy('date');
    }
    return this.db.attempts.orderBy('date').toArray();
  }

  getNoteStat(midi: number, clef: Clef): Promise<NoteStat | undefined> {
    return this.db.noteStats.get([midi, clef]);
  }

  async putNoteStat(stat: NoteStat): Promise<void> {
    await this.db.noteStats.put(stat);
  }

  listNoteStats(): Promise<NoteStat[]> {
    return this.db.noteStats.toArray();
  }

  close(): void {
    this.db.close();
  }
}
