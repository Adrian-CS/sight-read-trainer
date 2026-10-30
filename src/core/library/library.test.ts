import 'fake-indexeddb/auto';
import { DOMParser } from '@xmldom/xmldom';
import { afterEach, describe, expect, it } from 'vitest';
import { sampleMusicXml } from '../score/samples';
import { DexieRepository } from '../storage/DexieRepository';
import { ensureSamples, importScoreFile, renamePiece, type XmlParser } from './library';

const parseXml: XmlParser = (xml) =>
  new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document;
let repo: DexieRepository;
let n = 0;
afterEach(() => repo.close());

const file = (name: string, text: string) => ({
  name,
  arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer,
});

describe('library', () => {
  it('importa, renombra y lista piezas', async () => {
    repo = new DexieRepository(`lib-${n++}`);
    const piece = await importScoreFile(
      repo,
      file('oda.musicxml', sampleMusicXml('sample-oda')!),
      parseXml,
    );
    expect(piece).toMatchObject({
      title: 'Oda a la alegría',
      composer: 'Ludwig van Beethoven',
      measureCount: 16,
    });

    await renamePiece(repo, piece.id, '  Himno  ');
    expect((await repo.getPiece(piece.id))?.title).toBe('Himno');
    await renamePiece(repo, piece.id, '   ');
    expect((await repo.getPiece(piece.id))?.title).toBe('Himno');
  });

  it('usa el nombre del archivo si la partitura no tiene título', async () => {
    repo = new DexieRepository(`lib-${n++}`);
    const xml = sampleMusicXml('sample-oda')!.replace(/<work>.*?<\/work>/, '');
    const piece = await importScoreFile(repo, file('mi_pieza-nueva.xml', xml), parseXml);
    expect(piece.title).toBe('mi pieza nueva');
  });

  it('añade los ejemplos una sola vez, aunque se borren', async () => {
    repo = new DexieRepository(`lib-${n++}`);
    await ensureSamples(repo, parseXml);
    const pieces = await repo.listPieces();
    expect(pieces.map((p) => p.sampleId)).toEqual([
      'sample-estrellita',
      'sample-oda',
      'sample-martinillo',
    ]);

    await repo.deletePiece('sample-oda');
    await ensureSamples(repo, parseXml);
    expect(await repo.listPieces()).toHaveLength(2);
  });
});
