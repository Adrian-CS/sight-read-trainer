import JSZip from 'jszip';

export const SCORE_FILE_ACCEPT = '.musicxml,.xml,.mxl';

export class ScoreFileError extends Error {
  constructor(
    readonly reason: 'unsupported' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}

/** Ruta del archivo principal dentro de un .mxl según META-INF/container.xml. */
export function rootfilePath(containerXml: string): string | null {
  const match = /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/.exec(containerXml);
  return match ? match[1] : null;
}

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
}

function decodeText(bytes: Uint8Array): string {
  // UTF-16 con BOM (algunos exportadores antiguos); si no, UTF-8.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

async function unzipMxl(bytes: Uint8Array): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ScoreFileError('invalid', 'El archivo .mxl está dañado');
  }
  const container = zip.file('META-INF/container.xml');
  let path = container ? rootfilePath(await container.async('string')) : null;
  if (!path || !zip.file(path)) {
    path =
      Object.keys(zip.files).find(
        (name) => !name.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(name),
      ) ?? null;
  }
  if (!path) throw new ScoreFileError('invalid', 'El .mxl no contiene ninguna partitura');
  return decodeText(await zip.file(path)!.async('uint8array'));
}

/** Lee un .musicxml, .xml o .mxl y devuelve el MusicXML descomprimido. */
export async function readScoreFile(name: string, data: ArrayBuffer | Uint8Array): Promise<string> {
  if (!/\.(musicxml|xml|mxl)$/i.test(name)) {
    throw new ScoreFileError('unsupported', 'Formato no admitido');
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const xml = isZip(bytes) ? await unzipMxl(bytes) : decodeText(bytes);
  if (!/<score-(partwise|timewise)\b/.test(xml)) {
    throw new ScoreFileError('invalid', 'No es una partitura MusicXML');
  }
  if (/<score-timewise\b/.test(xml)) {
    throw new ScoreFileError('unsupported', 'MusicXML "timewise" no está soportado');
  }
  return xml;
}
