<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{ eyebrow?: string; title?: string; meta?: string; raised?: boolean }>(),
  { raised: false },
);
const hasHead = computed(() => Boolean(props.eyebrow ?? props.title ?? props.meta));
</script>

<template>
  <div class="loomn-card" :class="{ 'is-raised': raised }">
    <div v-if="hasHead" class="loomn-card__head">
      <span v-if="eyebrow" class="loomn-card__eyebrow">{{ eyebrow }}</span>
      <span v-if="title" class="loomn-card__title">{{ title }}</span>
      <span v-if="meta" class="loomn-card__meta">{{ meta }}</span>
    </div>
    <div class="loomn-card__body"><slot /></div>
  </div>
</template>

<style scoped>
.loomn-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-1);
}
.loomn-card.is-raised {
  border-color: var(--line-2);
  box-shadow: var(--shadow-2);
}
.loomn-card__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.loomn-card__eyebrow {
  font-size: var(--fs-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-3);
  font-weight: var(--fw-semibold);
}
.loomn-card__title {
  font-family: var(--f-sans);
  font-size: var(--fs-h3);
  font-weight: var(--fw-medium);
  color: var(--text);
}
.loomn-card__meta {
  margin-left: auto;
  font-family: var(--f-mono);
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.loomn-card__body {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
</style>
