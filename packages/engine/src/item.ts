import type { Actor, Item } from './actor';

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
