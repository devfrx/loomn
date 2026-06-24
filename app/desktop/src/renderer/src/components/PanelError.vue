<script setup lang="ts">
// Surfacing coerente degli errori dei canali read (I-08): un errore di lettura non deve mai restare
// silenzioso (un pannello vuoto e indistinguibile da "tutto ok ma vuoto"). Presentazionale puro:
// nessuno store, nessun dispatch; null = non rende nulla. Allineato a NarrativePanel.narr__error.
defineProps<{ error: string | null }>();
</script>

<template>
  <p v-if="error" class="panel-error" role="alert">{{ error }}</p>
</template>

<style scoped>
.panel-error { color: var(--bad); font-size: var(--fs-sm); margin: 0; }
</style>
