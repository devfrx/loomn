<script setup lang="ts">
import LoomnPanel from './LoomnPanel.vue';
import DiceCanvas from './DiceCanvas.vue';
import { useDiceStore } from '../stores/dice';

const dice = useDiceStore();
</script>

<template>
  <LoomnPanel title="Dadi" eyebrow="esito">
    <div class="dice">
      <DiceCanvas class="dice__canvas" />
      <div v-if="dice.rolls.length === 0" class="dice__empty">Nessun tiro ancora.</div>
      <ul v-else class="dice__readout">
        <li v-for="(r, idx) in dice.rolls" :key="idx" class="dice__row">
          <span class="dice__tag">{{ r.tag }}</span>
          <span v-if="r.modifierTotal !== 0" class="dice__chip">{{ r.modifierTotal >= 0 ? '+' : '' }}{{ r.modifierTotal }}</span>
          <span class="dice__total">{{ r.total }}</span>
          <span v-if="r.outcome !== undefined" class="dice__outcome">{{ r.outcome }}</span>
          <span v-if="r.dc !== undefined" class="dice__dc">vs CD {{ r.dc }}</span>
          <span v-for="(t, ti) in r.tokens" :key="`t-${ti}`" class="dice__token">d{{ t.sides }}: {{ t.value }}</span>
        </li>
      </ul>
    </div>
  </LoomnPanel>
</template>

<style scoped>
.dice { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; }
.dice__canvas { flex: 1; min-height: 140px; }
.dice__empty { color: var(--text-3); font-size: 13px; }
.dice__readout { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.dice__row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-family: var(--f-mono); font-size: 12px; }
.dice__tag { color: var(--text-3); }
.dice__chip { color: var(--accent); }
.dice__total { font-weight: 700; color: var(--text); }
.dice__outcome { color: var(--accent); text-transform: uppercase; letter-spacing: 0.04em; }
.dice__dc { color: var(--text-3); }
.dice__token { color: var(--text-2); border: 1px solid var(--line); border-radius: 5px; padding: 0 5px; }
</style>
