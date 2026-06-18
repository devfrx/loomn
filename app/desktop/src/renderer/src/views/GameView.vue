<script setup lang="ts">
import { computed } from 'vue';
import { GridLayout, GridItem } from 'grid-layout-plus';
import { useReadModelStore } from '../stores/read-model';
import type { PhaseView } from '../stores/read-model';
import { createLocalStoragePersistence } from '../layout/persistence';
import { useGameLayout } from '../composables/use-game-layout';
import LoomnPanel from '../components/LoomnPanel.vue';

const store = useReadModelStore();
const phase = computed<PhaseView>(() => store.phase);
const persistence = createLocalStoragePersistence();
const { layout, onLayoutUpdated } = useGameLayout(phase, persistence);

// Titoli dei pannelli fondazionali. Il contenuto profondo arriva nei sotto-piani.
const titles: Record<string, string> = {
  narrative: 'Narrazione',
  sheet: 'Scheda',
  encounter: 'Scontro',
  dice: 'Dadi',
};
</script>

<template>
  <main class="game-view">
    <GridLayout
      v-model:layout="layout"
      :col-num="12"
      :row-height="30"
      :margin="[14, 14]"
      @layout-updated="onLayoutUpdated"
    >
      <GridItem v-for="item in layout" :key="item.i" :x="item.x" :y="item.y" :w="item.w" :h="item.h" :i="item.i">
        <LoomnPanel :title="titles[item.i] ?? item.i" eyebrow="pannello">
          <p class="game-view__placeholder">Contenuto nel Piano 10b / 10c / 10d.</p>
        </LoomnPanel>
      </GridItem>
    </GridLayout>
  </main>
</template>

<style scoped>
.game-view {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.game-view__placeholder {
  color: var(--text-3);
  font-size: 13px;
}
</style>
