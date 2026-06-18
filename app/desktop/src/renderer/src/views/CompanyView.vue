<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import LoomnPanel from '../components/LoomnPanel.vue';
import LoomnButton from '../components/LoomnButton.vue';
import { useReadModelStore } from '../stores/read-model';
import { useRulesetStore } from '../stores/ruleset';
import { buildActor, type ActorFormState } from '../lib/actor-form';

const store = useReadModelStore();
const ruleset = useRulesetStore();

const open = ref(false);
const feedback = ref<string | null>(null);
const form = reactive<ActorFormState>({ name: '', kind: 'pc', attributes: {}, skills: {}, resources: {} });

/** Inizializza il form dal vocabolario: attributi/abilita a 0, risorse pre-compilate da
 *  defaultResources (o {0,0}). */
function resetForm(): void {
  const v = ruleset.vocabulary;
  form.name = '';
  form.kind = 'pc';
  form.attributes = Object.fromEntries((v?.attributes ?? []).map((a) => [a, 0]));
  form.skills = Object.fromEntries((v?.skills ?? []).map((s) => [s, 0]));
  form.resources = Object.fromEntries(
    (v?.resources ?? []).map((r) => [r, { ...(v?.defaultResources[r] ?? { current: 0, max: 0 }) }]),
  );
}

/** Apre il creatore partendo sempre da un form pulito (niente nome/feedback stantii da una sessione
 *  annullata in precedenza). */
function openCreator(): void {
  resetForm();
  feedback.value = null;
  open.value = true;
}

onMounted(async () => {
  await ruleset.load();
  resetForm();
});
watch(() => ruleset.vocabulary, resetForm);

const canSubmit = computed<boolean>(() => form.name.trim() !== '' && ruleset.loaded);

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  feedback.value = null;
  try {
    const actor = buildActor(form, store.actors.map((a) => a.id));
    const res = await window.loomn.dispatch({ type: 'AddActor', actor });
    if (res.ok) {
      open.value = false;
      resetForm();
    } else {
      feedback.value = res.error;
    }
  } catch (e) {
    // Mai fallire in silenzio: un errore inatteso (es. serializzazione IPC) va mostrato all utente.
    feedback.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="compagnia" title="Compagnia" :meta="`${store.actors.length} attori`">
      <div class="head-actions">
        <LoomnButton variant="solid" @click="openCreator">Aggiungi PG/PNG</LoomnButton>
      </div>

      <ul v-if="store.actors.length" class="roster">
        <li v-for="a in store.actors" :key="a.id" class="roster__row">
          <span class="roster__name">{{ a.name }}</span>
          <span class="roster__kind">{{ a.kind }}</span>
        </li>
      </ul>
      <p v-else>Nessun attore ancora. Relazioni e dettagli arrivano nel Piano 10e.</p>

      <div v-if="open" class="creator">
        <h3 class="creator__title">Nuovo attore</h3>
        <div class="form">
          <label class="field">
            <span class="field__label">Nome</span>
            <input v-model="form.name" class="field__input" type="text" />
          </label>
          <label class="field">
            <span class="field__label">Tipo</span>
            <select v-model="form.kind" class="field__input">
              <option value="pc">PG</option>
              <option value="npc">PNG</option>
            </select>
          </label>

          <div class="grid">
            <div v-for="(_, attr) in form.attributes" :key="`a-${attr}`" class="num">
              <span class="num__label">{{ attr }}</span>
              <input v-model.number="form.attributes[attr]" class="field__input" type="number" />
            </div>
          </div>
          <div class="grid">
            <div v-for="(_, sk) in form.skills" :key="`s-${sk}`" class="num">
              <span class="num__label">{{ sk }}</span>
              <input v-model.number="form.skills[sk]" class="field__input" type="number" />
            </div>
          </div>
          <div class="grid">
            <div v-for="(pool, res) in form.resources" :key="`r-${res}`" class="num">
              <span class="num__label">{{ res }}</span>
              <div class="pool">
                <input v-model.number="pool.current" class="field__input" type="number" aria-label="current" />
                <span>/</span>
                <input v-model.number="pool.max" class="field__input" type="number" aria-label="max" />
              </div>
            </div>
          </div>

          <div class="actions">
            <LoomnButton variant="solid" :disabled="!canSubmit" @click="submit">Crea</LoomnButton>
            <LoomnButton variant="ghost" @click="open = false">Annulla</LoomnButton>
            <span v-if="feedback" class="feedback">{{ feedback }}</span>
          </div>
        </div>
      </div>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view { flex: 1; min-height: 0; }
.head-actions { margin-bottom: 14px; }
.roster { list-style: none; display: flex; flex-direction: column; gap: 8px; padding: 0; }
.roster__row { display: flex; justify-content: space-between; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.roster__name { color: var(--text); }
.roster__kind { font-family: var(--f-mono); font-size: 11px; color: var(--text-3); }
.creator { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
.creator__title { font-family: var(--f-display); font-size: 16px; margin: 0 0 12px; }
.form { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field__label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
.field__input { font: inherit; font-family: var(--f-mono); font-size: 13px; color: var(--text); background: var(--well); border: 1px solid var(--line-2); border-radius: 10px; padding: 8px 11px; }
.field__input:focus { outline: none; border-color: var(--accent); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
.num { display: flex; flex-direction: column; gap: 4px; }
.num__label { font-size: 11px; color: var(--text-3); }
.pool { display: flex; align-items: center; gap: 6px; }
.pool .field__input { width: 64px; }
.actions { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
.feedback { font-size: 12px; color: #d98b6b; }
</style>
