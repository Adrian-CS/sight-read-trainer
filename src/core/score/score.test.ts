import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildMusicXml, parseToken } from './buildMusicXml';
import { parseScore } from './parseScore';
import { readScoreFile, rootfilePath } from './readScoreFile';
import { SAMPLE_SCORES, sampleMusicXml } from './samples';

const parse = (xml: string) =>
  parseScore(new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document);
const bytes = (s: string) => new TextEncoder().encode(s);

describe('buildMusicXml + parseScore', () => {
  it('construye y vuelve a leer una pieza a dos manos', () => {
    const xml = buildMusicXml({
      title: 'Prueba & co',
      composer: 'Yo',
      beats: 3,
      beatType: 4,
      keyFifths: -1,
      tempo: 90,
      right: ['C4:q D4:q Bb4:q', 'F#4:h.'],
      left: ['C3+E3+G3:h. ', 'r:h C3:q'],
    });
    const score = parse(xml);
    expect(score.title).toBe('Prueba & co');
    expect(score.composer).toBe('Yo');
    expect(score.tempo).toBe(90);
    expect(score.staves.map((s) => s.clef)).toEqual(['G', 'F']);
    expect(score.measures).toHaveLength(2);
    const [m1, m2] = score.measures;
    expect(m1).toMatchObject({ number: '1', beats: 3, beatType: 4, keyFifths: -1, length: 3 });
    expect(m1.notes.filter((n) => n.staff === 0).map((n) => [n.midi, n.onset])).toEqual([
      [60, 0],
      [62, 1],
      [70, 2],
    ]);
    // acorde de la izquierda: tres notas en el mismo instante
    expect(m1.notes.filter((n) => n.staff === 1).map((n) => [n.midi, n.onset, n.duration])).toEqual(
      [
        [48, 0, 3],
        [52, 0, 3],
        [55, 0, 3],
      ],
    );
    expect(m2.notes.map((n) => [n.midi, n.onset, n.staff])).toEqual([
      [66, 0, 0],
      [48, 2, 1],
    ]);
  });

  it('rechaza compases con duración incorrecta', () => {
    expect(() =>
      buildMusicXml({ title: 'x', beats: 4, beatType: 4, keyFifths: 0, right: ['C4:q'] }),
    ).toThrow(/Compás 1/);
    expect(() => parseToken('H4:q')).toThrow();
  });

  it('las piezas de ejemplo son válidas', () => {
    for (const sample of SAMPLE_SCORES) {
      const score = parse(sampleMusicXml(sample.id)!);
      expect(score.measures).toHaveLength(sample.right.length);
      expect(score.measures.every((m) => m.length === 4)).toBe(true);
    }
  });

  it('lee una pieza larga (128 compases) rápido', () => {
    const right = Array.from({ length: 128 }, () => 'C4:e D4:e E4:e F4:e G4:e A4:e B4:e C5:e');
    const left = Array.from({ length: 128 }, () => 'C3+G3:h G2+D3:h');
    const xml = buildMusicXml({ title: 'Larga', beats: 4, beatType: 4, keyFifths: 0, right, left });
    const start = performance.now();
    const score = parse(xml);
    expect(score.measures).toHaveLength(128);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('readScoreFile', () => {
  const xml = sampleMusicXml('sample-oda')!;

  it('acepta .musicxml y .xml', async () => {
    expect(await readScoreFile('a.musicxml', bytes(xml))).toBe(xml);
    expect(await readScoreFile('A.XML', bytes(xml))).toBe(xml);
  });

  it('descomprime .mxl usando container.xml', async () => {
    const zip = new JSZip();
    zip.file(
      'META-INF/container.xml',
      '<container><rootfiles><rootfile full-path="score/oda.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>',
    );
    zip.file('score/oda.xml', xml);
    const data = await zip.generateAsync({ type: 'uint8array' });
    expect(await readScoreFile('oda.mxl', data)).toBe(xml);
  });

  it('descomprime .mxl sin container.xml', async () => {
    const zip = new JSZip();
    zip.file('oda.musicxml', xml);
    expect(await readScoreFile('oda.mxl', await zip.generateAsync({ type: 'uint8array' }))).toBe(
      xml,
    );
  });

  it('rechaza archivos que no son partituras', async () => {
    await expect(readScoreFile('a.pdf', bytes('x'))).rejects.toMatchObject({
      reason: 'unsupported',
    });
    await expect(readScoreFile('a.xml', bytes('<html/>'))).rejects.toMatchObject({
      reason: 'invalid',
    });
    await expect(readScoreFile('a.mxl', bytes('PKnope'))).rejects.toMatchObject({
      reason: 'invalid',
    });
  });

  it('lee la ruta del archivo raíz', () => {
    expect(rootfilePath(`<rootfile full-path='x/y.xml'/>`)).toBe('x/y.xml');
    expect(rootfilePath('<container/>')).toBeNull();
  });
});
