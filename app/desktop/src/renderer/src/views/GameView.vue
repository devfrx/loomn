<script setup lang="ts">
import LoomnPanel from '../components/LoomnPanel.vue';
</script>

<template>
  <main class="game-view">
    <LoomnPanel eyebrow="gioco" title="Plancia di gioco">
      <p>La plancia a pannelli arriva nel prossimo passo di questo piano.</p>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.game-view {
  flex: 1;
  min-height: 0;
}
</style>
