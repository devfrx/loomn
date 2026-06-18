import { describe, it, expect } from 'vitest';
import { presetFor, PANELS } from './presets';

describe('presetFor', () => {
  it('in combat include lo scontro e non la scheda', () => {
    const ids = presetFor('combat').map((it) => it.i);
    expect(ids).toContain(PANELS.encounter);
    expect(ids).not.toContain(PANELS.sheet);
    expect(ids).toContain(PANELS.narrative);
    expect(ids).toContain(PANELS.dice);
  });

  it('in exploration include la scheda e non lo scontro', () => {
    const ids = presetFor('exploration').map((it) => it.i);
    expect(ids).toContain(PANELS.sheet);
    expect(ids).not.toContain(PANELS.encounter);
  });

  it('dialogue e downtime condividono il preset non-combat', () => {
    expect(presetFor('dialogue')).toEqual(presetFor('downtime'));
    expect(presetFor('dialogue')).toEqual(presetFor('exploration'));
  });

  it('ritorna una copia (mutare il risultato non altera la chiamata successiva)', () => {
    const first = presetFor('combat');
    const item = first[0];
    if (item) item.x = 999;
    expect(presetFor('combat')[0]?.x).not.toBe(999);
  });
});
