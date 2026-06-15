import type { Actor, Item } from './actor';
import type { DieGroup, RollMode } from './dice';

/** Aggiunge un oggetto all'inventario. Funzione pura. */
export function addItem(actor: Actor, item: Item): Actor {
  return { ...actor, items: [...actor.items, item] };
}

/** Rimuove l'oggetto con l'id dato (no-op se assente). Funzione pura. */
export function removeItem(actor: Actor, itemId: string): Actor {
  return { ...actor, items: actor.items.filter((i) => i.id !== itemId) };
}

/** Imposta lo stato 'equipped' dell'oggetto con l'id dato. Funzione pura. */
export function setEquipped(actor: Actor, itemId: string, equipped: boolean): Actor {
  return {
    ...actor,
    items: actor.items.map((i) => (i.id === itemId ? { ...i, equipped } : i)),
  };
}

/** Gli oggetti attualmente equipaggiati. */
export function equippedItems(actor: Actor): Item[] {
  return actor.items.filter((i) => i.equipped);
}

/** Raccoglie i dadi degli effetti contributeDice del modo indicato. */
export function collectItemDice(items: Item[], mode: RollMode): DieGroup[] {
  const dice: DieGroup[] = [];
  for (const item of items) {
    for (const e of item.effects) {
      if (e.kind === 'contributeDice' && e.mode === mode) {
        dice.push(...e.dice);
      }
    }
  }
  return dice;
}

/** Somma i checkModifier degli oggetti: globali (appliesTo assente) + quelli sul target. */
export function collectItemCheckModifier(items: Item[], target?: string): number {
  let total = 0;
  for (const item of items) {
    for (const e of item.effects) {
      if (e.kind === 'checkModifier' && (e.appliesTo === undefined || e.appliesTo === target)) {
        total += e.value;
      }
    }
  }
  return total;
}

/** Valore di una difesa: base + somma dei defenseModifier degli oggetti EQUIPAGGIATI per quella difesa. */
export function defenseValue(actor: Actor, defense: string, base: number): number {
  let total = base;
  for (const item of equippedItems(actor)) {
    for (const e of item.effects) {
      if (e.kind === 'defenseModifier' && e.defense === defense) {
        total += e.value;
      }
    }
  }
  return total;
}
