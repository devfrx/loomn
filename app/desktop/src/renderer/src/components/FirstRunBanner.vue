<script setup lang="ts">
import { ref, computed } from 'vue';
import { useProviderStatusStore } from '../stores/provider-status';

const status = useProviderStatusStore();
const dismissed = ref(false);

// Mostra solo quando lo status e caricato, nessun provider e configurato, e non e stato dismesso.
const visible = computed<boolean>(() => status.loaded && !status.providerConfigured && !dismissed.value);
</script>

<template>
  <div v-if="visible" class="first-run" role="status">
    <span class="first-run__text">Nessun provider AI configurato. Il turno narrativo e disabilitato finche non ne configuri uno.</span>
    <RouterLink to="/impostazioni" class="first-run__cta">Vai a Impostazioni</RouterLink>
    <button class="first-run__dismiss" type="button" aria-label="ignora" @click="dismissed = true">&#x2715;</button>
  </div>
</template>

<style scoped>
.first-run {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-radius: var(--r);
  color: var(--text);
  font-size: 13px;
}
.first-run__text { flex: 1; }
.first-run__cta {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  white-space: nowrap;
}
.first-run__dismiss {
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  padding: 4px 6px;
  line-height: 1;
  font-size: 13px;
}
.first-run__dismiss:hover { color: var(--text); }
</style>
