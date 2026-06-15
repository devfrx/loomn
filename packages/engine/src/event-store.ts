import type { DomainEvent, GameState } from './events';
import { applyEvent, replay } from './events';

export interface StoredEvent {
  seq: number;
  event: DomainEvent;
}

/** Errore di concorrenza ottimistica: la versione attesa non coincide con quella attuale. */
export class ConcurrencyError extends Error {
  constructor(expected: number, actual: number) {
    super(`Conflitto di concorrenza: atteso ${expected}, attuale ${actual}`);
    this.name = 'ConcurrencyError';
  }
}

export interface EventStore {
  /** Versione corrente = numero di eventi nello stream. */
  version(): number;
  /** Aggiunge eventi se `expectedVersion` coincide con la versione corrente; ritorna la nuova
   *  versione. Lancia `ConcurrencyError` in caso di conflitto (concorrenza ottimistica). */
  append(events: DomainEvent[], expectedVersion: number): number;
  /** Tutti gli eventi memorizzati, in ordine, con il loro seq (1-based). */
  load(): StoredEvent[];
}

/** Implementazione in-memory della porta EventStore. La persistenza (SQLite) implementerà
 *  la stessa interfaccia in un piano successivo. */
export function createInMemoryEventStore(): EventStore {
  const stored: StoredEvent[] = [];
  return {
    version() {
      return stored.length;
    },
    append(events, expectedVersion) {
      if (expectedVersion !== stored.length) {
        throw new ConcurrencyError(expectedVersion, stored.length);
      }
      for (const event of events) {
        stored.push({ seq: stored.length + 1, event });
      }
      return stored.length;
    },
    load() {
      return [...stored];
    },
  };
}

export interface Snapshot {
  state: GameState;
  version: number;
}

/** Crea uno snapshot dallo stato corrente (la sua `version`). */
export function takeSnapshot(state: GameState): Snapshot {
  return { state, version: state.version };
}

/** Ricostruisce lo stato: da uno snapshot applica solo gli eventi con seq successivo alla sua
 *  versione; senza snapshot riapplica tutti gli eventi dallo stato iniziale. */
export function rebuild(stored: StoredEvent[], snapshot?: Snapshot): GameState {
  if (snapshot === undefined) {
    return replay(stored.map((s) => s.event));
  }
  const tail = stored.filter((s) => s.seq > snapshot.version).map((s) => s.event);
  return tail.reduce(applyEvent, snapshot.state);
}
