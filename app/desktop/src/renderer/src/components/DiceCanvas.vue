<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import DiceBox from '@3d-dice/dice-box-threejs';
import { useDiceStore } from '../stores/dice';

const dice = useDiceStore();
const mountEl = ref<HTMLElement | null>(null);
let box: DiceBox | null = null;
let ready: Promise<void> | null = null;

// Init LAZY: la prima volta che c e un tiro da mostrare (mai a finestra nascosta nel gate).
function ensureBox(): Promise<void> {
  if (ready !== null) return ready;
  const el = mountEl.value;
  if (el === null) return Promise.resolve();
  el.id = el.id || 'loomn-dice-box';
  box = new DiceBox(`#${el.id}`, {
    assetPath: '/dice-box/',
    sounds: false,
    scale: 6,
    theme_colorset: 'white',
    theme_material: 'glass',
  });
  ready = box.initialize().catch((err: unknown) => {
    // Degrada in silenzio: il readout (valori del motore) resta autorevole anche senza 3D.
    console.warn('DiceCanvas init fallita, solo readout:', err);
    box = null;
  });
  return ready;
}

async function animate(notation: string): Promise<void> {
  await ensureBox();
  if (box === null) return;
  try {
    await box.roll(notation);
  } catch (err) {
    console.warn('DiceCanvas roll fallita:', err);
  }
}

// Ri-triggera al cambio di nonce; anima solo i tiri con notazione standard.
watch(
  () => dice.nonce,
  () => {
    for (const r of dice.rolls) {
      if (r.notation !== null) void animate(r.notation);
    }
  },
);

onBeforeUnmount(() => {
  box?.clear?.();
  box = null;
  ready = null;
});
</script>

<template>
  <div ref="mountEl" class="dice-canvas"></div>
</template>

<style scoped>
.dice-canvas { width: 100%; height: 100%; min-height: 140px; position: relative; }
</style>
