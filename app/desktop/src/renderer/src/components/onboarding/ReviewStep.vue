<script setup lang="ts">
import { useOnboardingStore } from '../../stores/onboarding';
import PanelError from '../PanelError.vue';

defineOptions({ name: 'ReviewStep' });
const store = useOnboardingStore();
</script>

<template>
  <div v-if="store.draft" class="review">
    <h2>Rivedi e ritocca la bozza</h2>

    <section class="card">
      <label class="field">Nome <input v-model="store.draft.frame.name" type="text" /></label>
      <label class="field">Premessa <textarea v-model="store.draft.frame.premise" rows="2"></textarea></label>
      <label class="field">Tono <input v-model="store.draft.frame.tone" type="text" /></label>
      <label class="field">Luogo <input v-model="store.draft.frame.setting.place" type="text" /></label>
      <label class="field">Epoca <input v-model="store.draft.frame.setting.era" type="text" /></label>
      <label class="field">Scena d apertura <textarea v-model="store.draft.frame.openingScene" rows="2"></textarea></label>
      <label v-for="(hook, i) in store.draft.frame.hooks" :key="i" class="field">Hook
        <input v-model="store.draft.frame.hooks[i]" type="text" />
      </label>
    </section>

    <section v-for="npc in store.draft.keyNpcs" :key="npc.id" class="card">
      <input v-model="npc.name" type="text" />
      <textarea v-model="npc.description" rows="2"></textarea>
      <span class="chip">stat: da codice</span>
    </section>

    <section v-for="place in store.draft.keyPlaces" :key="place.id" class="card">
      <input v-model="place.name" type="text" />
      <textarea v-model="place.description" rows="2"></textarea>
    </section>

    <section v-for="(fact, i) in store.draft.initialFacts" :key="i" class="fact">
      <input v-model="fact.subject" type="text" />
      <input v-model="fact.predicate" type="text" />
      <input v-model="fact.object" type="text" />
    </section>

    <PanelError :error="store.error" />
    <div class="actions">
      <button class="secondary" type="button" @click="store.regenerate()">Rigenera</button>
      <button class="confirm" type="button" :disabled="store.status === 'seeding'" @click="store.confirm()">
        {{ store.status === 'seeding' ? 'Seeding…' : 'Conferma e inizia' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.review { display: flex; flex-direction: column; gap: 12px; }
.card { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--line-2); border-radius: 10px; padding: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-2); }
.fact { display: flex; gap: 6px; }
.fact input { flex: 1; min-width: 0; }
.chip { font-size: 11px; color: var(--text-3); }
.actions { display: flex; justify-content: space-between; gap: 12px; align-items: center; }

.confirm {
  font-family: var(--f-sans);
  font-size: 13px;
  padding: 8px 16px;
  border-radius: var(--r-xs, 8px);
  border: none;
  background: var(--accent);
  color: var(--ink, #0c0d10);
  cursor: pointer;
  transition: opacity 0.15s, filter 0.15s;
}
.confirm:hover:not(:disabled) { filter: brightness(1.08); }
.confirm:disabled { opacity: 0.5; cursor: not-allowed; }

.secondary {
  font-family: var(--f-sans);
  font-size: 13px;
  padding: 8px 14px;
  border-radius: var(--r-xs, 8px);
  background: transparent;
  border: 1px solid var(--line-2);
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.secondary:hover { border-color: var(--accent); background: var(--accent-soft); }
</style>
