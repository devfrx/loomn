<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, RouterLink } from 'vue-router';
import { useReadModelStore } from './stores/read-model';
import type { PhaseView } from './stores/read-model';
import FirstRunBanner from './components/FirstRunBanner.vue';
import GmConsole from './components/GmConsole.vue';

const store = useReadModelStore();
const phase = computed<PhaseView>(() => store.phase);

const navItems = [
  { to: '/', label: 'Gioco' },
  { to: '/diario', label: 'Diario' },
  { to: '/scheda', label: 'Scheda' },
  { to: '/compagnia', label: 'Compagnia' },
  { to: '/impostazioni', label: 'Impostazioni' },
] as const;

const phaseLabels: Record<PhaseView, string> = {
  exploration: 'esplorazione',
  dialogue: 'dialogo',
  combat: 'combattimento',
  downtime: 'quiete',
};
const phaseLabel = computed(() => phaseLabels[phase.value]);
</script>

<template>
  <div class="app-shell" :data-phase="phase">
    <aside class="rail" aria-label="navigazione">
      <div class="brand-mark">L</div>
      <RouterLink
        v-for="it in navItems"
        :key="it.to"
        :to="it.to"
        class="nav-btn"
        exact-active-class="nav-btn--active"
        :title="it.label"
        :aria-label="it.label"
        >{{ it.label.charAt(0) }}</RouterLink
      >
    </aside>
    <div class="stage">
      <header class="topbar">
        <div class="wordmark">Loomn<span class="dot">.</span></div>
        <div class="phase-badge">{{ phaseLabel }}</div>
        <GmConsole />
      </header>
      <FirstRunBanner />
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 66px 1fr;
  height: 100vh;
  padding: 14px;
  gap: 14px;
}
.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 0;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.brand-mark {
  font-family: var(--f-display);
  font-weight: 600;
  font-size: 20px;
  color: var(--text);
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  margin-bottom: 10px;
  border: 1px solid var(--line-2);
  border-radius: 12px;
  background: linear-gradient(180deg, var(--raise), var(--panel));
}
.nav-btn {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: var(--text-3);
  border: 1px solid transparent;
  cursor: pointer;
  transition: 0.18s;
  text-decoration: none;
  font-family: var(--f-display);
  font-size: 15px;
}
.nav-btn:hover {
  color: var(--text-2);
  background: var(--panel-hi);
  border-color: var(--line);
}
.nav-btn--active {
  color: var(--accent);
  background: var(--accent-dim);
  border-color: color-mix(in srgb, var(--accent) 25%, transparent);
}
.stage {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 18px;
  height: 54px;
  padding: 0 18px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--r);
}
.wordmark {
  font-family: var(--f-display);
  font-size: 21px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.wordmark .dot {
  color: var(--accent);
}
.phase-badge {
  margin-left: auto;
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--accent);
  background: var(--accent-dim);
  border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
  padding: 6px 12px;
  border-radius: 9px;
}
</style>
