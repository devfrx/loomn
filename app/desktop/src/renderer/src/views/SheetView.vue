<script setup lang="ts">
import LoomnPanel from '../components/LoomnPanel.vue';
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="scheda" title="Scheda del personaggio">
      <p>Attributi, risorse, condizioni e inventario data-driven arrivano nel Piano 10d.</p>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view {
  flex: 1;
  min-height: 0;
}
</style>
