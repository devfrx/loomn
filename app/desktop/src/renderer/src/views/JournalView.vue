<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import LoomnPanel from '../components/LoomnPanel.vue';
import LoomnButton from '../components/LoomnButton.vue';
import PanelError from '../components/PanelError.vue';
import { useNarrationStore } from '../stores/narration';
import { useJournalStore } from '../stores/journal';
import { groupSummaries, sortCanonBySalience, levelLabel } from '../lib/journal-view';

const narration = useNarrationStore();
const journal = useJournalStore();

// Scope = etichetta dei riassunti prodotti dalla Reflection (vedi campaign-service.ts). Stato locale.
const scope = ref('sessione');

onMounted(() => {
  void narration.loadInitial();
  void journal.load();
});

const summaryGroups = computed(() => groupSummaries(journal.summaries));
const canonLines = computed(() => sortCanonBySalience(journal.canon));

function reflectNow(): void {
  const s = scope.value.trim();
  if (s === '' || journal.reflecting) return;
  void journal.runReflect(s);
}
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="diario" title="Diario" :meta="`${journal.canon.length} fatti`">
      <div class="journal">
        <PanelError :error="journal.error" />
        <section class="block">
          <h4 class="block__title">Riflessione</h4>
          <div class="reflect">
            <input
              v-model="scope"
              class="reflect__scope"
              type="text"
              aria-label="ambito riflessione"
              placeholder="ambito (es. sessione)"
            />
            <LoomnButton variant="solid" :disabled="journal.reflecting || scope.trim() === ''" @click="reflectNow">
              {{ journal.reflecting ? 'Rifletto...' : 'Rifletti' }}
            </LoomnButton>
            <span v-if="journal.reflectInfo" class="reflect__info">{{ journal.reflectInfo }}</span>
          </div>
        </section>

        <section class="block">
          <h4 class="block__title">Cronologia</h4>
          <ul v-if="narration.entries.length" class="timeline">
            <li v-for="e in narration.entries" :key="e.key" class="entry">
              <p class="entry__action">{{ e.playerAction }}</p>
              <p class="entry__narr">{{ e.narration }}</p>
            </li>
          </ul>
          <p v-else class="empty">Nessuna scena ancora narrata.</p>
          <LoomnButton v-if="narration.hasMore" variant="ghost" @click="narration.loadOlder()">Carica piu vecchie</LoomnButton>
        </section>

        <section class="block">
          <h4 class="block__title">Riassunti</h4>
          <div v-if="summaryGroups.length" class="summaries">
            <div v-for="g in summaryGroups" :key="g.level" class="sgroup">
              <span class="sgroup__level">{{ levelLabel(g.level) }}</span>
              <ul class="sgroup__list">
                <li v-for="s in g.items" :key="s.id" class="summary">
                  <p class="summary__text">{{ s.text }}</p>
                  <span class="summary__meta">{{ s.scope }} · {{ s.range }}</span>
                </li>
              </ul>
            </div>
          </div>
          <p v-else class="empty">Nessun riassunto. Usa Rifletti per generarli.</p>
        </section>

        <section class="block">
          <h4 class="block__title">Fatti canonici</h4>
          <ul v-if="canonLines.length" class="canon">
            <li v-for="f in canonLines" :key="f.id" class="fact" :class="{ 'fact--retracted': f.retracted }">
              <span class="fact__text">{{ f.text }}</span>
            </li>
          </ul>
          <p v-else class="empty">Nessun fatto canonico ancora.</p>
        </section>
      </div>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view { flex: 1; min-height: 0; }
.journal { display: flex; flex-direction: column; gap: 18px; }
.block { display: flex; flex-direction: column; gap: 8px; }
.block__title { margin: 0; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-3); font-weight: 600; }
.reflect { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.reflect__scope { font: inherit; font-family: var(--f-mono); font-size: 13px; color: var(--text); background: var(--well); border: 1px solid var(--line-2); border-radius: 10px; padding: 8px 11px; }
.reflect__scope:focus { outline: none; border-color: var(--accent); }
.reflect__info { font-size: 12px; color: var(--text-2); }
.timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.entry { padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.entry__action { margin: 0 0 4px; font-family: var(--f-ui); font-size: 12px; color: var(--text-3); }
.entry__narr { margin: 0; font-family: var(--f-read); font-size: 14px; color: var(--text); line-height: 1.5; }
.summaries { display: flex; flex-direction: column; gap: 12px; }
.sgroup { display: flex; flex-direction: column; gap: 6px; }
.sgroup__level { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
.sgroup__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.summary { padding: 8px 11px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.summary__text { margin: 0 0 4px; font-family: var(--f-read); font-size: 13px; color: var(--text); line-height: 1.45; }
.summary__meta { font-family: var(--f-mono); font-size: 10.5px; color: var(--text-3); }
.canon { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.fact { padding: 7px 11px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.fact__text { font-family: var(--f-ui); font-size: 13px; color: var(--text); }
.fact--retracted { opacity: 0.5; }
.fact--retracted .fact__text { text-decoration: line-through; }
.empty { color: var(--text-3); font-size: 13px; margin: 0; }
</style>
