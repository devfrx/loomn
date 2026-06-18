import type { ActorView } from '../stores/read-model';
import type { RulesetResult } from '@loomn/shared';

// Tipi derivati dal contratto IPC (il renderer non importa engine per il dominio).
export type VocabularyView = Extract<RulesetResult, { ok: true }>['vocabulary'];
type ConditionView = ActorView['conditions'][number];
type ConditionEffectView = ConditionView['effects'][number];
type DurationView = ConditionView['duration'];
type ItemView = ActorView['items'][number];
type ItemEffectView = ItemView['effects'][number];

/** Una voce ordinata attributo/abilita (chiave del vocabolario + valore dell attore). */
export interface SheetEntry {
  key: string;
  value: number;
}

/** Una barra risorsa con percentuale gia clampata in [0,1] (max 0 -> 0). */
export interface ResourceBar {
  key: string;
  current: number;
  max: number;
  pct: number;
}

/** Una riga condizione: chiave + fonte + dettaglio effetti + durata, gia formattati. */
export interface ConditionLine {
  key: string;
  source: string;
  detail: string;
  duration: string;
}

/** Una riga oggetto (display-only): nome + flag equipaggiato + effetti renderizzati. */
export interface ItemLine {
  id: string;
  name: string;
  equipped: boolean;
  effects: string[];
}

/** Vista della scheda derivata dal read-model. */
export interface SheetView {
  id: string;
  name: string;
  kind: 'pc' | 'npc';
  level: number;
  xp: number;
  attributes: SheetEntry[];
  skills: SheetEntry[];
  resources: ResourceBar[];
  conditions: ConditionLine[];
  items: ItemLine[];
}

/** Ordina le chiavi presenti secondo `order` (vocabolario), poi appende le extra in ordine alfabetico.
 *  Niente chiave dell attore viene persa; il vocabolario guida ordine e primato. */
function orderKeys(present: readonly string[], order: readonly string[]): string[] {
  const inOrder = new Set(order);
  const presentSet = new Set(present);
  const out: string[] = [];
  for (const key of order) if (presentSet.has(key)) out.push(key);
  for (const key of [...present].sort()) if (!inOrder.has(key)) out.push(key);
  return out;
}

/** Coppie {chiave,valore} di un Record numerico, ordinate dal vocabolario (extra in coda, ordinate). */
export function orderedEntries(record: Record<string, number>, order: readonly string[]): SheetEntry[] {
  return orderKeys(Object.keys(record), order).map((key) => ({ key, value: record[key] ?? 0 }));
}

/** Barre risorsa ordinate dal vocabolario; pct = current/max clampata in [0,1] (max<=0 -> 0). */
export function resourceBars(
  resources: Record<string, { current: number; max: number }>,
  order: readonly string[],
): ResourceBar[] {
  return orderKeys(Object.keys(resources), order).map((key) => {
    const pool = resources[key] ?? { current: 0, max: 0 };
    const pct = pool.max > 0 ? Math.max(0, Math.min(1, pool.current / pool.max)) : 0;
    return { key, current: pool.current, max: pool.max, pct };
  });
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function formatDuration(duration: DurationView): string {
  switch (duration.kind) {
    case 'turns':
      return `${duration.remaining} turni`;
    case 'scenes':
      return `${duration.remaining} scene`;
    case 'permanent':
      return 'permanente';
    default: {
      const _exhaustive: never = duration;
      return _exhaustive;
    }
  }
}

function formatConditionEffect(effect: ConditionEffectView): string {
  switch (effect.kind) {
    case 'checkModifier':
      return effect.appliesTo !== undefined
        ? `${effect.appliesTo} ${signed(effect.value)}`
        : `prove ${signed(effect.value)}`;
    case 'resourcePerTurn':
      return `${effect.resource} ${signed(effect.delta)}/turno`;
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

function formatDice(dice: ReadonlyArray<{ count: number; sides: number }>): string {
  return dice.map((g) => `${g.count}d${g.sides}`).join(' + ');
}

function formatItemEffect(effect: ItemEffectView): string {
  switch (effect.kind) {
    case 'contributeDice':
      return `dadi ${formatDice(effect.dice)} (${effect.mode})`;
    case 'checkModifier':
      return effect.appliesTo !== undefined
        ? `${effect.appliesTo} ${signed(effect.value)}`
        : `prove ${signed(effect.value)}`;
    case 'defenseModifier':
      return `${effect.defense} ${signed(effect.value)}`;
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

/** Mappa un attore del read-model nella vista della scheda. Pura: nessun side effect, nessun RNG.
 *  Ordine/etichette data-driven dal vocabolario (null = solo dati dell attore, ordine alfabetico). */
export function toSheetView(actor: ActorView, vocab: VocabularyView | null): SheetView {
  return {
    id: actor.id,
    name: actor.name,
    kind: actor.kind,
    level: actor.progression.level,
    xp: actor.progression.xp,
    attributes: orderedEntries(actor.attributes, vocab?.attributes ?? []),
    skills: orderedEntries(actor.skills, vocab?.skills ?? []),
    resources: resourceBars(actor.resources, vocab?.resources ?? []),
    conditions: actor.conditions.map((c) => ({
      key: c.key,
      source: c.source,
      detail: c.effects.map(formatConditionEffect).join(', '),
      duration: formatDuration(c.duration),
    })),
    items: actor.items.map((it) => ({
      id: it.id,
      name: it.name,
      equipped: it.equipped,
      effects: it.effects.map(formatItemEffect),
    })),
  };
}

/** Risolve quale attore mostrare: preferisce `selectedId` se ancora nel roster, altrimenti il primo
 *  PG, altrimenti il primo attore, altrimenti null. Pura (display-only). */
export function resolveSelectedActor(actors: readonly ActorView[], selectedId: string | null): ActorView | null {
  if (selectedId !== null) {
    const found = actors.find((a) => a.id === selectedId);
    if (found) return found;
  }
  const pc = actors.find((a) => a.kind === 'pc');
  if (pc) return pc;
  return actors[0] ?? null;
}
