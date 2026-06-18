import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ReadModelPush } from '@loomn/shared';

// Tipi di vista derivati dal CONTRATTO IPC (shared resta la fonte; il renderer NON importa engine
// per il dominio). state DTO = ReadModelPush['state'] (z.infer di gameStateSchema).
export type GameStateView = ReadModelPush['state'];
export type ActorView = GameStateView['actors'][string];
export type QuestView = GameStateView['quests'][string];
export type EncounterView = GameStateView['encounter'];
export type PhaseView = GameStateView['phase'];

// Mirror del literal engine INITIAL_PHASE (phaseSchema lo include): fase di default prima del 1o push.
const INITIAL_PHASE: PhaseView = 'exploration';

/** Store read-side (spec 5.2): tiene lo snapshot {version, state} spinto da read-model-push.
 *  Il renderer NON muta lo stato: applyPush e l unica scrittura, i getter sono proiezioni. */
export const useReadModelStore = defineStore('readModel', () => {
  const version = ref(0);
  const state = ref<GameStateView | null>(null);

  /** Applica un push read-side (lo chiama il bootstrap su onReadModelPush). */
  function applyPush(push: ReadModelPush): void {
    version.value = push.version;
    state.value = push.state;
  }

  const loaded = computed<boolean>(() => state.value !== null);
  const phase = computed<PhaseView>(() => state.value?.phase ?? INITIAL_PHASE);
  const actors = computed<ActorView[]>(() => (state.value ? Object.values(state.value.actors) : []));
  const pcs = computed<ActorView[]>(() => actors.value.filter((a) => a.kind === 'pc'));
  const npcs = computed<ActorView[]>(() => actors.value.filter((a) => a.kind === 'npc'));
  const quests = computed<QuestView[]>(() => (state.value ? Object.values(state.value.quests) : []));
  const encounter = computed<EncounterView>(() => state.value?.encounter ?? null);
  const inCombat = computed<boolean>(() => phase.value === 'combat');

  return { version, applyPush, loaded, phase, actors, pcs, npcs, quests, encounter, inCombat };
});
