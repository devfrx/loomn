import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

// M-09: scandisce il sorgente GREZZO di tutti i .vue del renderer e verifica che il colore d errore
// hardcoded #d98b6b (drift fuori dal token --bad) non ricompaia. Istituzionalizza il grep della
// scheda d audit: 3 file lo avevano reintrodotto, questo guard impedisce il quarto.
// NB: niente import.meta.glob (vite/client non e risolvibile per nome da app/desktop sotto pnpm →
// non tipato sotto vue-tsc); si usa node:fs, tipato via @types/node.
const here = dirname(fileURLToPath(import.meta.url));

function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...vueFiles(full));
    else if (entry.name.endsWith('.vue')) out.push(full);
  }
  return out;
}

describe('coerenza colore errore (M-09)', () => {
  it('nessun .vue hardcoda il colore drift #d98b6b', () => {
    const offenders = vueFiles(here)
      .filter((f) => readFileSync(f, 'utf8').includes('#d98b6b'))
      .map((f) => relative(here, f).replace(/\\/g, '/'))
      .sort();
    expect(offenders).toEqual([]);
  });
});
