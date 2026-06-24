<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' }>(), {
  variant: 'neutral',
});
</script>

<template>
  <span class="loomn-tag" :class="`loomn-tag--${variant}`"><slot /></span>
</template>

<style scoped>
.loomn-tag {
  display: inline-block;
  font-size: var(--fs-xs);
  letter-spacing: 0.04em;
  padding: 3px 9px;
  border: 1px solid transparent;
  border-radius: var(--r-pill);
}
.loomn-tag--neutral {
  background: var(--surface-2);
  border-color: var(--line);
  color: var(--text-2);
}
.loomn-tag--accent {
  background: var(--accent-soft);
  color: var(--accent-press);
}
.loomn-tag--ok {
  background: var(--ok-soft);
  color: var(--ok);
}
.loomn-tag--warn {
  background: var(--warn-soft);
  color: var(--warn);
}
.loomn-tag--bad {
  background: var(--bad-soft);
  color: var(--bad);
}
</style>
