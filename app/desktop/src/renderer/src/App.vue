<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { useReadModelStore } from './stores/read-model';
import type { PhaseView } from './stores/read-model';
import { routeTitle } from './lib/shell-nav';
import FirstRunBanner from './components/FirstRunBanner.vue';
import GmConsole from './components/GmConsole.vue';
import LoomnRail from './components/LoomnRail.vue';

const store = useReadModelStore();
const route = useRoute();
const phase = computed<PhaseView>(() => store.phase);
const surfaceTitle = computed<string>(() => {
  const n = route.name;
  return typeof n === 'string' ? routeTitle(n) : '';
});

const phaseLabels: Record<PhaseView, string> = {
  exploration: 'esplorazione',
  dialogue: 'dialogo',
  combat: 'combattimento',
  downtime: 'quiete',
};
const phaseLabel = computed(() => phaseLabels[phase.value]);

// M-15: la Regia (override manuale del Master) e un dev-tool -> montata solo in sviluppo.
const isDev = import.meta.env.DEV;
</script>

<template>
  <div class="app-shell" :data-phase="phase">
    <LoomnRail />
    <div class="stage">
      <header class="topbar">
        <h1 class="topbar__title">{{ surfaceTitle }}</h1>
        <div class="phase-badge">{{ phaseLabel }}</div>
        <GmConsole v-if="isDev" />
      </header>
      <FirstRunBanner />
      <div class="stage__view">
        <RouterView v-slot="{ Component }">
          <Transition name="view" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  height: 100vh;
  padding: 14px;
  gap: 14px;
}
.stage {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  min-height: 0;
}
.stage__view {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: auto;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 18px;
  height: var(--topbar-h);
  padding: 0 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.topbar__title {
  margin: 0;
  font-family: var(--f-sans);
  font-size: var(--fs-h2);
  font-weight: var(--fw-semibold);
  color: var(--text);
  letter-spacing: 0.01em;
}
.phase-badge {
  margin-left: auto;
  font-size: var(--fs-xs);
  letter-spacing: 0.02em;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-soft);
  padding: 6px 12px;
  border-radius: var(--r-xs);
}
.view-enter-active,
.view-leave-active {
  transition: opacity var(--dur) var(--ease);
}
.view-enter-from,
.view-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .view-enter-active,
  .view-leave-active {
    transition: none;
  }
}
</style>
