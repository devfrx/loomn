<script setup lang="ts">
import type { IconName } from '../lib/shell-nav';

defineProps<{ name: IconName }>();
</script>

<template>
  <svg
    class="loomn-icon"
    :data-icon="name"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'game'">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </template>
    <template v-else-if="name === 'journal'">
      <path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z" />
      <path d="M20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z" />
    </template>
    <template v-else-if="name === 'sheet'">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </template>
    <template v-else-if="name === 'company'">
      <circle cx="9" cy="8" r="3" />
      <path d="M4 19a5 5 0 0 1 10 0" />
      <path d="M15.5 5.5a3 3 0 0 1 0 5" />
      <path d="M16 14.5a5 5 0 0 1 4 4.5" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="8" cy="16" r="2" />
    </template>
    <template v-else-if="name === 'theme-system'">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'theme-light'">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
      />
    </template>
    <template v-else-if="name === 'theme-dark'">
      <path d="M20 13a7.5 7.5 0 1 1-9-9 6 6 0 0 0 9 9z" />
    </template>
    <template v-else-if="name === 'chevron'">
      <path d="M9 6l6 6-6 6" />
    </template>
  </svg>
</template>

<style scoped>
.loomn-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  display: block;
  flex: none;
}
</style>
