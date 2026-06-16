<script setup lang="ts">
import { ref } from 'vue';

const status = ref('Loomn pronto (persistenza + IPC, Piano 9c-ii). UI completa: Piano 10.');
</script>

<template>
  <main>
    <h1>Loomn</h1>
    <p>{{ status }}</p>
  </main>
</template>
