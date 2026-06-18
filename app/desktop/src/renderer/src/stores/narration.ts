import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { NarrationEntryDto } from '@loomn/shared';

/** Voce del log: una entry della storia (con seq) o un turno appena giocato (senza seq finche
 *  non ricaricato dallo stream). `key` rende stabile il v-for. */
export interface NarrationLine {
  key: string;
  seq?: number;
  playerAction: string;
  narration: string;
}

/** Store della storia di narrazione (read-side + append ottimistico del turno). */
export const useNarrationStore = defineStore('narration', () => {
  const entries = ref<NarrationLine[]>([]);
  const hasMore = ref(false);
  const pending = ref(false);
  const error = ref<string | null>(null);
  // Contatore delle voci live, per-istanza (dentro la factory): chiavi stabili e niente leak fra test.
  let liveCounter = 0;

  function toLine(e: NarrationEntryDto): NarrationLine {
    return { key: `seq-${e.seq}`, seq: e.seq, playerAction: e.playerAction, narration: e.narration };
  }

  /** Carica la finestra piu recente. L API e newest-first -> invertiamo per il log cronologico. */
  async function loadInitial(): Promise<void> {
    error.value = null;
    const res = await window.loomn.getNarrationHistory({});
    if (!res.ok) {
      error.value = res.error;
      return;
    }
    entries.value = res.entries.map(toLine).reverse();
    hasMore.value = res.hasMore;
  }

  /** Carica le voci piu vecchie (before = seq minima presente) e le antepone. */
  async function loadOlder(): Promise<void> {
    const oldest = entries.value.find((e) => e.seq !== undefined)?.seq;
    if (oldest === undefined) return;
    const res = await window.loomn.getNarrationHistory({ before: oldest });
    if (!res.ok) {
      error.value = res.error;
      return;
    }
    entries.value = [...res.entries.map(toLine).reverse(), ...entries.value];
    hasMore.value = res.hasMore;
  }

  /** Appende il turno appena narrato (la voce piu recente). */
  function appendTurn(playerAction: string, narration: string): void {
    liveCounter += 1;
    entries.value = [...entries.value, { key: `live-${liveCounter}`, playerAction, narration }];
  }

  function setPending(value: boolean): void {
    pending.value = value;
  }
  function setError(message: string | null): void {
    error.value = message;
  }

  return { entries, hasMore, pending, error, loadInitial, loadOlder, appendTurn, setPending, setError };
});
