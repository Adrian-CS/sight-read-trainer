import { parseScore } from '../score/parseScore';
import { readScoreFile } from '../score/readScoreFile';
import { SAMPLE_SCORES, sampleMusicXml } from '../score/samples';
import type { Repository } from '../storage/Repository';
import type { Piece } from '../storage/types';

export type XmlParser = (xml: string) => Document;

export const browserXmlParser: XmlParser = (xml) =>
  new DOMParser().parseFromString(xml, 'text/xml');

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function fileTitle(name: string): string {
  return (
    name
      .replace(/\.(musicxml|xml|mxl)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Sin título'
  );
}

export async function pieceText(piece: Piece): Promise<string> {
  return typeof piece.musicXml === 'string' ? piece.musicXml : piece.musicXml.text();
}

/** Crea una pieza a partir de MusicXML ya descomprimido. */
export function createPiece(
  xml: string,
  parseXml: XmlParser,
  fallbackTitle: string,
  extra: Partial<Piece> = {},
): Piece {
  const score = parseScore(parseXml(xml));
  return {
    id: newId(),
    title: score.title || fallbackTitle,
    composer: score.composer || undefined,
    measureCount: score.measures.length,
    musicXml: xml,
    createdAt: Date.now(),
    hand: 'both',
    ...extra,
  };
}

export async function importScoreFile(
  repo: Repository,
  file: { name: string; arrayBuffer(): Promise<ArrayBuffer> },
  parseXml: XmlParser = browserXmlParser,
): Promise<Piece> {
  const xml = await readScoreFile(file.name, await file.arrayBuffer());
  const piece = createPiece(xml, parseXml, fileTitle(file.name));
  await repo.savePiece(piece);
  return piece;
}

export async function renamePiece(repo: Repository, id: string, title: string): Promise<void> {
  const piece = await repo.getPiece(id);
  const clean = title.trim();
  if (!piece || !clean) return;
  await repo.savePiece({ ...piece, title: clean });
}

/** Añade las piezas de ejemplo la primera vez que se abre la biblioteca. */
export async function ensureSamples(
  repo: Repository,
  parseXml: XmlParser = browserXmlParser,
): Promise<void> {
  const settings = await repo.getSettings();
  if (settings.samplesSeeded) return;
  const now = Date.now();
  for (const [i, sample] of SAMPLE_SCORES.entries()) {
    const piece = createPiece(sampleMusicXml(sample.id)!, parseXml, sample.title, {
      id: sample.id,
      sampleId: sample.id,
      // Orden estable: el primero de la lista queda arriba.
      createdAt: now - i,
    });
    await repo.savePiece(piece);
  }
  await repo.updateSettings({ samplesSeeded: true });
}
