<script setup lang="ts">
import { useReadModelStore } from '../stores/read-model';
import LoomnPanel from '../components/LoomnPanel.vue';

const store = useReadModelStore();
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="compagnia" title="Compagnia" :meta="`${store.actors.length} attori`">
      <ul v-if="store.actors.length" class="roster">
        <li v-for="a in store.actors" :key="a.id" class="roster__row">
          <span class="roster__name">{{ a.name }}</span>
          <span class="roster__kind">{{ a.kind }}</span>
        </li>
      </ul>
      <p v-else>Nessun attore ancora. Relazioni e dettagli arrivano nel Piano 10e.</p>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view {
  flex: 1;
  min-height: 0;
}
.roster {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.roster__row {
  display: flex;
  justify-content: space-between;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: #101216;
}
.roster__name {
  color: var(--text);
}
.roster__kind {
  font-family: var(--f-mono);
  font-size: 11px;
  color: var(--text-3);
}
</style>
