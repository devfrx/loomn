import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RolledDice } from '../lib/turn-events';

/** Store della coda dadi: i tiri dell ultimo turno + nonce per ri-triggerare l animazione. */
export const useDiceStore = defineStore('dice', () => {
  const rolls = ref<RolledDice[]>([]);
  const nonce = ref(0);

  /** Imposta i tiri dell ultimo turno. Lista vuota = nessun tiro -> non ri-triggera l animazione. */
  function enqueue(next: RolledDice[]): void {
    if (next.length === 0) return;
    rolls.value = next;
    nonce.value += 1;
  }

  /** Svuota i tiri (readout pulito) lasciando il nonce com e. */
  function clear(): void {
    rolls.value = [];
  }

  return { rolls, nonce, enqueue, clear };
});
