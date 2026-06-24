<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import LoomnPanel from './LoomnPanel.vue';
import PanelError from './PanelError.vue';
import LoomnTag from './LoomnTag.vue';
import { useReadModelStore } from '../stores/read-model';
import { useRulesetStore } from '../stores/ruleset';
import { resolveSelectedActor, toSheetView } from '../lib/sheet-view';

const store = useReadModelStore();
const ruleset = useRulesetStore();

onMounted(() => void ruleset.load());

// Selezione locale (display-only, non dominio): null = lascia decidere a resolveSelectedActor
// (primo PG). Se l attore scelto sparisce dal read-model, la funzione pura ripiega in modo grazioso.
const selectedId = ref<string | null>(null);
const actor = computed(() => resolveSelectedActor(store.actors, selectedId.value));
const sheet = computed(() => (actor.value ? toSheetView(actor.value, ruleset.vocabulary) : null));

function selectActor(event: Event): void {
  selectedId.value = (event.target as HTMLSelectElement).value || null;
}

const kindLabel = computed(() => (sheet.value?.kind === 'pc' ? 'PG' : 'PNG'));
</script>

<template>
  <LoomnPanel eyebrow="scheda" :title="sheet?.name ?? 'Scheda'" :meta="sheet ? `liv. ${sheet.level}` : ''">
    <PanelError :error="ruleset.error" />
    <div v-if="sheet" class="sheet">
      <div class="sheet__head">
        <select v-if="store.actors.length > 1" :value="actor?.id ?? ''" class="sheet__select" aria-label="attore" @change="selectActor">
          <option v-for="a in store.actors" :key="a.id" :value="a.id">{{ a.name }} ({{ a.kind === 'pc' ? 'PG' : 'PNG' }})</option>
        </select>
        <span class="sheet__id">{{ kindLabel }} · xp {{ sheet.xp }}</span>
      </div>

      <section v-if="sheet.attributes.length" class="block">
        <h4 class="block__title">Attributi</h4>
        <div class="stats">
          <div v-for="a in sheet.attributes" :key="a.key" class="stat">
            <span class="stat__label">{{ a.key }}</span>
            <span class="stat__value">{{ a.value }}</span>
          </div>
        </div>
      </section>

      <section v-if="sheet.skills.length" class="block">
        <h4 class="block__title">Abilita</h4>
        <div class="stats">
          <div v-for="s in sheet.skills" :key="s.key" class="stat">
            <span class="stat__label">{{ s.key }}</span>
            <span class="stat__value">{{ s.value }}</span>
          </div>
        </div>
      </section>

      <section v-if="sheet.resources.length" class="block">
        <h4 class="block__title">Risorse</h4>
        <div class="bars">
          <div v-for="r in sheet.resources" :key="r.key" class="bar">
            <div class="bar__head">
              <span class="bar__label">{{ r.key }}</span>
              <span class="bar__num">{{ r.current }}/{{ r.max }}</span>
            </div>
            <div class="bar__track"><div class="bar__fill" :style="{ width: `${Math.round(r.pct * 100)}%` }" /></div>
          </div>
        </div>
      </section>

      <section v-if="sheet.conditions.length" class="block">
        <h4 class="block__title">Condizioni</h4>
        <ul class="conds">
          <li v-for="c in sheet.conditions" :key="c.key" class="cond">
            <span class="cond__key">{{ c.key }}</span>
            <span class="cond__detail">{{ c.detail }}</span>
            <span class="cond__dur">{{ c.duration }}</span>
          </li>
        </ul>
      </section>

      <section class="block">
        <h4 class="block__title">Inventario</h4>
        <ul v-if="sheet.items.length" class="items">
          <li v-for="it in sheet.items" :key="it.id" class="item">
            <div class="item__head">
              <span class="item__name">{{ it.name }}</span>
              <LoomnTag v-if="it.equipped" variant="accent">equipaggiato</LoomnTag>
            </div>
            <span v-if="it.effects.length" class="item__effects">{{ it.effects.join(' · ') }}</span>
          </li>
        </ul>
        <p v-else class="empty">Zaino vuoto.</p>
      </section>
    </div>
    <p v-else class="empty">Nessun personaggio nel roster.</p>
  </LoomnPanel>
</template>

<style scoped>
.sheet { display: flex; flex-direction: column; gap: 16px; height: 100%; min-height: 0; }
.sheet__head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sheet__select { font: inherit; font-family: var(--f-sans); font-size: 13px; color: var(--text); background: var(--well); border: 1px solid var(--line-2); border-radius: 10px; padding: 7px 10px; }
.sheet__select:focus { outline: none; border-color: var(--accent); }
.sheet__id { font-family: var(--f-mono); font-size: 11px; color: var(--text-3); }
.block { display: flex; flex-direction: column; gap: 8px; }
.block__title { margin: 0; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-3); font-weight: 600; }
.stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.stat { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.stat__label { font-size: 11px; color: var(--text-3); text-transform: capitalize; }
.stat__value { font-family: var(--f-mono); font-size: 18px; color: var(--text); }
.bars { display: flex; flex-direction: column; gap: 9px; }
.bar { display: flex; flex-direction: column; gap: 4px; }
.bar__head { display: flex; justify-content: space-between; align-items: baseline; }
.bar__label { font-size: 12px; color: var(--text-2); text-transform: capitalize; }
.bar__num { font-family: var(--f-mono); font-size: 11px; color: var(--text-3); }
.bar__track { height: 7px; border-radius: 99px; background: var(--well); border: 1px solid var(--line); overflow: hidden; }
.bar__fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.3s ease; }
.conds { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.cond { display: flex; align-items: baseline; gap: 8px; padding: 7px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.cond__key { color: var(--text); text-transform: capitalize; }
.cond__detail { flex: 1; font-size: 12px; color: var(--text-2); }
.cond__dur { font-family: var(--f-mono); font-size: 10.5px; color: var(--text-3); }
.items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.item { display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.item__head { display: flex; align-items: center; gap: 8px; }
.item__name { color: var(--text); }
.item__effects { font-family: var(--f-mono); font-size: 11px; color: var(--text-3); }
.empty { color: var(--text-3); font-size: 13px; margin: 0; }
</style>
