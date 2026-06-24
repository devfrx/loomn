<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ eyebrow?: string; title?: string; meta?: string }>();
const hasHead = computed(() => Boolean(props.eyebrow ?? props.title ?? props.meta));
</script>

<template>
  <section class="loomn-panel">
    <header v-if="hasHead" class="loomn-panel__head">
      <span v-if="eyebrow" class="loomn-panel__eyebrow">{{ eyebrow }}</span>
      <span v-if="title" class="loomn-panel__title">{{ title }}</span>
      <span v-if="meta" class="loomn-panel__meta">{{ meta }}</span>
    </header>
    <div class="loomn-panel__body"><slot /></div>
  </section>
</template>

<style scoped>
.loomn-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
  box-shadow: var(--shadow-2);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.loomn-panel__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 18px 13px;
  border-bottom: 1px solid var(--line);
}
.loomn-panel__eyebrow {
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-3);
  font-weight: 600;
}
.loomn-panel__title {
  font-family: var(--f-sans);
  font-size: 17px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.2;
}
.loomn-panel__meta {
  margin-left: auto;
  font-family: var(--f-mono);
  font-size: 11px;
  color: var(--text-3);
}
.loomn-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 18px;
}
</style>
