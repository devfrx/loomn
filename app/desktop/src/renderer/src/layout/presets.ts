import type { PhaseView } from '../stores/read-model';

/** Un item di layout di grid-layout-plus (griglia a colonne; coordinate in celle). */
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Id dei pannelli del Gioco. Il CONTENUTO profondo arriva nei sotto-piani (narrazione/dadi 10b,
 *  scontro 10c, scheda 10d); 10a fissa il SET e le posizioni per fase. */
export const PANELS = {
  narrative: 'narrative',
  sheet: 'sheet',
  encounter: 'encounter',
  dice: 'dice',
} as const;

const COMBAT: LayoutItem[] = [
  { i: PANELS.narrative, x: 0, y: 0, w: 8, h: 12 },
  { i: PANELS.encounter, x: 8, y: 0, w: 4, h: 7 },
  { i: PANELS.dice, x: 8, y: 7, w: 4, h: 5 },
];

const NON_COMBAT: LayoutItem[] = [
  { i: PANELS.narrative, x: 0, y: 0, w: 8, h: 12 },
  { i: PANELS.sheet, x: 8, y: 0, w: 4, h: 7 },
  { i: PANELS.dice, x: 8, y: 7, w: 4, h: 5 },
];

/** Preset di default per fase (decisione 4/6 dello spec). combat = cockpit (scontro al posto della
 *  scheda); le fasi non-combat condividono il preset esplorativo. Ritorna una COPIA (no aliasing
 *  fra chiamate: il chiamante puo mutare il layout senza toccare i preset condivisi). */
export function presetFor(phase: PhaseView): LayoutItem[] {
  const base = phase === 'combat' ? COMBAT : NON_COMBAT;
  return base.map((it) => ({ ...it }));
}
