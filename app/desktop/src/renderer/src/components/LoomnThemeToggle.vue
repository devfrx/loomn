<script setup lang="ts">
import { computed } from 'vue';
import { useTheme, type ThemeChoice } from '../composables/use-theme';
import LoomnIcon from './LoomnIcon.vue';
import type { IconName } from '../lib/shell-nav';

defineProps<{ expanded?: boolean }>();
const { theme, set } = useTheme();

const CYCLE: ThemeChoice[] = ['system', 'light', 'dark'];
const ICON: Record<ThemeChoice, IconName> = {
  system: 'theme-system',
  light: 'theme-light',
  dark: 'theme-dark',
};
const LABEL: Record<ThemeChoice, string> = { system: 'auto', light: 'chiaro', dark: 'scuro' };
const current = computed<ThemeChoice>(() => theme.value);

function cycle(): void {
  const i = CYCLE.indexOf(current.value);
  const next = CYCLE[(i + 1) % CYCLE.length];
  if (next) set(next);
}
</script>

<template>
  <div v-if="expanded" class="theme-seg" role="group" aria-label="tema">
    <button
      v-for="c in CYCLE"
      :key="c"
      type="button"
      class="theme-seg__btn"
      :class="{ 'is-active': current === c }"
      :aria-pressed="current === c"
      :title="LABEL[c]"
      :aria-label="LABEL[c]"
      @click="set(c)"
    >
      <LoomnIcon :name="ICON[c]" />
    </button>
  </div>
  <button
    v-else
    type="button"
    class="theme-cycle"
    :title="`Tema: ${LABEL[current]}`"
    :aria-label="`Tema: ${LABEL[current]}`"
    @click="cycle"
  >
    <LoomnIcon :name="ICON[current]" />
  </button>
</template>

<style scoped>
.theme-cycle,
.theme-seg__btn {
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
.theme-cycle:hover,
.theme-seg__btn:hover {
  color: var(--text-2);
  background: var(--surface-2);
}
.theme-cycle:focus-visible,
.theme-seg__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.theme-seg {
  display: flex;
  gap: 2px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 2px;
}
.theme-seg__btn.is-active {
  color: var(--accent);
  background: var(--accent-soft);
}
</style>
