import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { RulesetResult } from '@loomn/shared';

type RulesetOk = Extract<RulesetResult, { ok: true }>;

// Default condiviso e stabile (come INITIAL_PHASE in read-model.ts): evita un nuovo literal a ogni
// valutazione del computed quando il ruleset non e ancora caricato. Trattato read-only dai consumer.
const EMPTY_PHASE_RULES = { combatOnly: [] as string[], nonCombatOnly: [] as string[] };

/** Vocabolario di gioco + enum + regole di fase (read-side 10g): fetch-once SU SUCCESSO (statico per
 *  sessione). Su un esito non ok data resta null e error e impostato -> un load() successivo riprova.
 *  Consumato dai form data-driven (creazione PG, Regia GM). */
export const useRulesetStore = defineStore('ruleset', () => {
  const data = ref<RulesetOk | null>(null);
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    if (data.value !== null) return; // fetch-once
    const res = await window.loomn.getRuleset();
    if (res.ok) {
      data.value = res;
      error.value = null;
    } else {
      error.value = res.error;
    }
  }

  const loaded = computed<boolean>(() => data.value !== null);
  const vocabulary = computed(() => data.value?.vocabulary ?? null);
  const difficulties = computed<string[]>(() => data.value?.difficulties ?? []);
  const softPhases = computed<string[]>(() => data.value?.softPhases ?? []);
  const questOutcomes = computed<string[]>(() => data.value?.questOutcomes ?? []);
  const directions = computed<string[]>(() => data.value?.directions ?? []);
  const commandPhaseRules = computed(() => data.value?.commandPhaseRules ?? EMPTY_PHASE_RULES);

  return { load, loaded, error, vocabulary, difficulties, softPhases, questOutcomes, directions, commandPhaseRules };
});
