import { describe, it, expect } from 'vitest';
import { slugify } from './campaign-generation';

describe('slugify', () => {
  it('minuscola, accenti rimossi, spazi e simboli in trattini', () => {
    expect(slugify('Maestra Orsa')).toBe('maestra-orsa');
    expect(slugify('Città di Vetro!')).toBe('citta-di-vetro');
    expect(slugify('  Loy lo Sgherro  ')).toBe('loy-lo-sgherro');
    expect(slugify('Porto   Vetraio')).toBe('porto-vetraio');
  });

  it('una stringa senza alfanumerici diventa vuota', () => {
    expect(slugify('!!!')).toBe('');
  });
});
