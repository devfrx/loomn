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
import SheetPanel from '../components/SheetPanel.vue';

const store = useReadModelStore();
const phase = computed<PhaseView>(() => store.phase);
const persistence = createLocalStoragePersistence();
const { layout, onLayoutUpdated } = useGameLayout(phase, persistence);

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
        <SheetPanel v-else-if="item.i === 'sheet'" />
        <LoomnPanel v-else :title="item.i" eyebrow="pannello">
          <p class="game-view__placeholder">Pannello non riconosciuto.</p>
        </LoomnPanel>
      </GridItem>
    </GridLayout>
  </main>
</template>

<style scoped>
.game-view { flex: 1; min-height: 0; overflow: auto; }
.game-view__placeholder { color: var(--text-3); font-size: 13px; }
</style>
