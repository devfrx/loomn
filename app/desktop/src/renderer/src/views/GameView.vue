<script setup lang="ts">
import { computed } from 'vue';
import { GridLayout, GridItem } from 'grid-layout-plus';
import { useReadModelStore } from '../stores/read-model';
import type { PhaseView } from '../stores/read-model';
import { createLocalStoragePersistence } from '../layout/persistence';
import { useGameLayout } from '../composables/use-game-layout';
import LoomnPanel from '../components/LoomnPanel.vue';
import NarrativePanel from '../components/NarrativePanel.vue';
import DicePanel from '../components/DicePanel.vue';
import EncounterPanel from '../components/EncounterPanel.vue';

const store = useReadModelStore();
const phase = computed<PhaseView>(() => store.phase);
const persistence = createLocalStoragePersistence();
const { layout, onLayoutUpdated } = useGameLayout(phase, persistence);

// Titolo del pannello ancora placeholder (scheda 10d).
const titles: Record<string, string> = { sheet: 'Scheda' };
</script>

<template>
  <main class="game-view">
    <GridLayout
      :layout="layout"
      :col-num="12"
      :row-height="30"
      :margin="[14, 14]"
      @layout-updated="onLayoutUpdated"
    >
      <GridItem v-for="item in layout" :key="item.i" :x="item.x" :y="item.y" :w="item.w" :h="item.h" :i="item.i">
        <NarrativePanel v-if="item.i === 'narrative'" />
        <DicePanel v-else-if="item.i === 'dice'" />
        <EncounterPanel v-else-if="item.i === 'encounter'" />
        <LoomnPanel v-else :title="titles[item.i] ?? item.i" eyebrow="pannello">
          <p class="game-view__placeholder">Contenuto nel Piano 10d.</p>
        </LoomnPanel>
      </GridItem>
    </GridLayout>
  </main>
</template>

<style scoped>
.game-view { flex: 1; min-height: 0; overflow: auto; }
.game-view__placeholder { color: var(--text-3); font-size: 13px; }
</style>
