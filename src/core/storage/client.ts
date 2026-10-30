import { DexieRepository } from './DexieRepository';
import type { Repository } from './Repository';

let instance: Repository | null = null;

/** Repositorio compartido en el navegador (IndexedDB). */
export function getRepository(): Repository {
  instance ??= new DexieRepository();
  return instance;
}
