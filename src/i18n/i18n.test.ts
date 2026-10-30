import { describe, expect, it } from 'vitest';
import { t } from './index';

describe('t', () => {
  it('interpola variables', () => {
    expect(t('midi.failed', { message: 'boom' })).toBe('No se pudo acceder a MIDI: boom');
  });
});
