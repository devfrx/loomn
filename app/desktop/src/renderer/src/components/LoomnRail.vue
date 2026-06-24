<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { navItems } from '../lib/shell-nav';
import LoomnIcon from './LoomnIcon.vue';
import LoomnThemeToggle from './LoomnThemeToggle.vue';

const RAIL_KEY = 'loomn-rail';
// Letto in setup -> il primo render usa gia il valore persistito (niente flash). Default: compresso.
const expanded = ref<boolean>(localStorage.getItem(RAIL_KEY) === 'expanded');

function toggle(): void {
  expanded.value = !expanded.value;
  localStorage.setItem(RAIL_KEY, expanded.value ? 'expanded' : 'collapsed');
}
</script>

<template>
  <nav class="rail" :class="{ 'rail--expanded': expanded }" aria-label="navigazione">
    <div class="rail__brand">
      <span class="rail__brand-mark">L</span>
      <span v-if="expanded" class="rail__brand-word">Loomn<span class="rail__brand-dot">.</span></span>
    </div>

    <RouterLink
      v-for="it in navItems"
      :key="it.to"
      :to="it.to"
      class="nav-btn"
      exact-active-class="nav-btn--active"
      :title="it.label"
      :aria-label="it.label"
    >
      <LoomnIcon :name="it.icon" class="nav-btn__icon" />
      <span v-if="expanded" class="nav-btn__label">{{ it.label }}</span>
    </RouterLink>

    <div class="rail__foot">
      <LoomnThemeToggle :expanded="expanded" />
      <button
        type="button"
        class="rail__collapse"
        :aria-expanded="expanded"
        :aria-label="expanded ? 'Comprimi navigazione' : 'Espandi navigazione'"
        @click="toggle"
      >
        <LoomnIcon name="chevron" class="rail__collapse-icon" :class="{ 'is-flipped': expanded }" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: var(--rail-w);
  padding: 14px 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
  transition: width var(--dur) var(--ease);
}
.rail--expanded {
  width: var(--rail-w-expanded);
}
.rail__brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 4px;
  margin-bottom: 10px;
  height: 40px;
}
.rail__brand-mark {
  flex: none;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--f-sans);
  font-weight: var(--fw-semibold);
  font-size: var(--fs-h2);
}
.rail__brand-word {
  font-family: var(--f-sans);
  font-weight: var(--fw-semibold);
  font-size: var(--fs-h2);
  color: var(--text);
  white-space: nowrap;
}
.rail__brand-dot {
  color: var(--accent);
}
.nav-btn {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 40px;
  padding: 0 9px;
  border-radius: var(--r-sm);
  color: var(--text-3);
  border: 1px solid transparent;
  text-decoration: none;
  font-family: var(--f-sans);
  font-size: var(--fs-sm);
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.nav-btn:hover {
  color: var(--text-2);
  background: var(--surface-2);
  border-color: var(--line);
}
.nav-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.nav-btn--active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-soft);
}
.rail__foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 10px;
}
.rail__collapse {
  margin-left: auto;
  display: grid;
  place-items: center;
  color: var(--text-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-xs);
  cursor: pointer;
  padding: 7px;
  transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.rail__collapse:hover {
  color: var(--text-2);
  background: var(--surface-2);
}
.rail__collapse:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.rail__collapse-icon {
  transition: transform var(--dur) var(--ease);
}
.rail__collapse-icon.is-flipped {
  transform: scaleX(-1);
}
@media (prefers-reduced-motion: reduce) {
  .rail,
  .rail__collapse-icon {
    transition: none;
  }
}
</style>
