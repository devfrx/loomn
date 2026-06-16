<script setup lang="ts">
import { ref } from 'vue';

const status = ref('Shell Electron avviata (Piano 9a)');
</script>

<template>
  <main>
    <h1>Loomn</h1>
    <p>{{ status }}</p>
  </main>
</template>
