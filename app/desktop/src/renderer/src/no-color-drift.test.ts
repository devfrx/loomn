import { describe, it, expect } from 'vitest';

// M-09: importa il sorgente GREZZO di tutti i componenti/viste e verifica che il colore d errore
// hardcoded #d98b6b (drift fuori dal token --bad) non ricompaia in nessun .vue. Istituzionalizza il
// grep della scheda d audit: 3 file lo avevano reintrodotto, questo guard impedisce il quarto.
const sources = import.meta.glob('./**/*.vue', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('coerenza colore errore (M-09)', () => {
  it('nessun .vue hardcoda il colore drift #d98b6b', () => {
    const offenders = Object.entries(sources)
      .filter(([, src]) => src.includes('#d98b6b'))
      .map(([path]) => path)
      .sort();
    expect(offenders).toEqual([]);
  });
});
