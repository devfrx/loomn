<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import LoomnPanel from './LoomnPanel.vue';
import LoomnButton from './LoomnButton.vue';
import { useNarrationStore } from '../stores/narration';
import { useProviderStatusStore } from '../stores/provider-status';
import { useRunTurn } from '../composables/use-run-turn';

const narration = useNarrationStore();
const provider = useProviderStatusStore();
const { submit } = useRunTurn();

const draft = ref('');
const canSend = computed(() => provider.canRunTurn && !narration.pending && draft.value.trim() !== '');

onMounted(() => void narration.loadInitial());

async function onSend(): Promise<void> {
  if (!canSend.value) return;
  const action = draft.value;
  draft.value = '';
  await submit(action);
}
</script>

<template>
  <LoomnPanel title="Narrazione" eyebrow="storia">
    <div class="narr">
      <button v-if="narration.hasMore" class="narr__more" type="button" @click="narration.loadOlder()">
        Carica piu vecchie
      </button>
      <ol class="narr__log">
        <li v-for="line in narration.entries" :key="line.key" class="narr__entry">
          <p class="narr__action">{{ line.playerAction }}</p>
          <p class="narr__prose">{{ line.narration }}</p>
        </li>
      </ol>

      <p v-if="narration.pending" class="narr__pending">Il Master sta scrivendo...</p>
      <p v-if="narration.error" class="narr__error">{{ narration.error }}</p>

      <div class="narr__compose">
        <textarea
          v-model="draft"
          class="narr__input"
          rows="2"
          placeholder="Cosa fai?"
          :disabled="!provider.canRunTurn || narration.pending"
          @keydown.enter.exact.prevent="onSend"
        ></textarea>
        <LoomnButton :disabled="!canSend" @click="onSend">Invia</LoomnButton>
      </div>
      <p v-if="!provider.canRunTurn" class="narr__hint">
        Configura un provider in Impostazioni per giocare il turno.
      </p>
    </div>
  </LoomnPanel>
</template>

<style scoped>
.narr { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; }
.narr__log { list-style: none; margin: 0; padding: 0; overflow: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px; }
.narr__entry { display: flex; flex-direction: column; gap: 4px; }
.narr__action { color: var(--text-3); font-size: 12px; font-style: italic; margin: 0; }
.narr__prose { font-family: var(--font-serif, Newsreader, serif); font-size: 15px; line-height: 1.55; margin: 0; color: var(--text-1); }
.narr__more { align-self: center; background: none; border: 1px solid var(--line); color: var(--text-3); padding: 4px 10px; cursor: pointer; border-radius: 6px; }
.narr__pending { color: var(--accent); font-size: 13px; margin: 0; }
.narr__error { color: var(--danger, #c2553d); font-size: 13px; margin: 0; }
.narr__compose { display: flex; gap: 8px; align-items: flex-end; }
.narr__input { flex: 1; resize: none; background: var(--well); color: var(--text-1); border: 1px solid var(--line); border-radius: 8px; padding: 8px; font: inherit; }
.narr__hint { color: var(--text-3); font-size: 12px; margin: 0; }
</style>
