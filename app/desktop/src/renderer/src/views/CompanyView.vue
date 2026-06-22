<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import LoomnPanel from '../components/LoomnPanel.vue';
import LoomnButton from '../components/LoomnButton.vue';
import PanelError from '../components/PanelError.vue';
import { useReadModelStore, type ActorView } from '../stores/read-model';
import { useRulesetStore } from '../stores/ruleset';
import { useJournalStore } from '../stores/journal';
import { buildActor, type ActorFormState } from '../lib/actor-form';
import { toCompanyCard, canonForActor } from '../lib/company-view';
import { toCanonLine } from '../lib/journal-view';

const store = useReadModelStore();
const ruleset = useRulesetStore();
const journal = useJournalStore();

// Carte per gruppo: identita/livello/risorse (toCompanyCard) + relazioni canon (canonForActor →
// toCanonLine, display-only). Le relazioni strutturate sono deferite (spec §11).
function cardsFor(actors: ActorView[]) {
  return actors.map((a) => ({ card: toCompanyCard(a), relations: canonForActor(journal.canon, a).map(toCanonLine) }));
}
const pcCards = computed(() => cardsFor(store.pcs));
const npcCards = computed(() => cardsFor(store.npcs));

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
  void journal.load();
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
      <PanelError :error="ruleset.error" />
      <PanelError :error="journal.error" />
      <div class="head-actions">
        <LoomnButton variant="solid" @click="openCreator">Aggiungi PG/PNG</LoomnButton>
      </div>

      <div v-if="store.actors.length" class="roster">
        <section v-if="pcCards.length" class="group">
          <h3 class="group__title">Personaggi</h3>
          <ul class="cards">
            <li v-for="row in pcCards" :key="row.card.id" class="card">
              <div class="card__head">
                <span class="card__name">{{ row.card.name }}</span>
                <span class="card__lvl">liv. {{ row.card.level }}</span>
              </div>
              <div v-if="row.card.resources.length" class="card__res">
                <span v-for="r in row.card.resources" :key="r.key" class="res">{{ r.key }} {{ r.current }}/{{ r.max }}</span>
              </div>
              <span class="card__meta">xp {{ row.card.xp }} · {{ row.card.itemCount }} oggetti · {{ row.card.conditionCount }} condizioni</span>
              <ul v-if="row.relations.length" class="rel">
                <li v-for="f in row.relations" :key="f.id" class="rel__row">{{ f.text }}</li>
              </ul>
            </li>
          </ul>
        </section>
        <section v-if="npcCards.length" class="group">
          <h3 class="group__title">Personaggi non giocanti</h3>
          <ul class="cards">
            <li v-for="row in npcCards" :key="row.card.id" class="card">
              <div class="card__head">
                <span class="card__name">{{ row.card.name }}</span>
                <span class="card__lvl">liv. {{ row.card.level }}</span>
              </div>
              <div v-if="row.card.resources.length" class="card__res">
                <span v-for="r in row.card.resources" :key="r.key" class="res">{{ r.key }} {{ r.current }}/{{ r.max }}</span>
              </div>
              <span class="card__meta">xp {{ row.card.xp }} · {{ row.card.itemCount }} oggetti · {{ row.card.conditionCount }} condizioni</span>
              <ul v-if="row.relations.length" class="rel">
                <li v-for="f in row.relations" :key="f.id" class="rel__row">{{ f.text }}</li>
              </ul>
            </li>
          </ul>
        </section>
      </div>
      <p v-else>Nessun attore ancora. Crea un PG o PNG per iniziare.</p>

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
.roster { display: flex; flex-direction: column; gap: 18px; }
.group { display: flex; flex-direction: column; gap: 10px; }
.group__title { margin: 0; font-family: var(--f-display); font-size: 15px; color: var(--text-2); }
.cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.card { display: flex; flex-direction: column; gap: 7px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.card__head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.card__name { font-family: var(--f-display); font-size: 16px; color: var(--text); }
.card__lvl { font-family: var(--f-mono); font-size: 11px; color: var(--accent); }
.card__res { display: flex; flex-wrap: wrap; gap: 8px; }
.res { font-family: var(--f-mono); font-size: 11px; color: var(--text-2); border: 1px solid var(--line); border-radius: var(--r-xs); padding: 2px 7px; }
.card__meta { font-family: var(--f-mono); font-size: 10.5px; color: var(--text-3); }
.rel { list-style: none; margin: 4px 0 0; padding: 8px 0 0; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 4px; }
.rel__row { font-family: var(--f-ui); font-size: 12px; color: var(--text-2); }
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
.feedback { font-size: 12px; color: var(--bad); }
</style>
