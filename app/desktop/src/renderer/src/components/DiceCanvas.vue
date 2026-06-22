<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import DiceBox from '@3d-dice/dice-box-threejs';
import { useDiceStore } from '../stores/dice';

const dice = useDiceStore();
const mountEl = ref<HTMLElement | null>(null);
let box: DiceBox | null = null;
let ready: Promise<void> | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeRaf = 0;

// Init LAZY: la prima volta che c e un tiro da mostrare (mai a finestra nascosta nel gate).
// DiceCanvas e un singleton: una sola istanza per documento (l id del container e fisso).
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
    // ready=null permette un nuovo tentativo al prossimo tiro (errore transitorio di asset/WebGL).
    console.warn('DiceCanvas init fallita, solo readout:', err);
    box = null;
    ready = null;
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

// Ri-dimensiona il canvas 3D al cambio di dimensione del CONTENITORE (pannello grid-layout-plus).
// La libreria osserva SOLO window 'resize'; un resize del pannello non tocca la finestra -> il canvas
// resterebbe della dimensione iniziale e verrebbe tagliato. setDimensions({x,y}) e' la stessa
// operazione dell handler window.resize interno (dimensioni piene del container; legge solo .x/.y).
function syncSize(): void {
  const el = mountEl.value;
  if (box === null || el === null) return;
  const x = el.clientWidth;
  const y = el.clientHeight;
  if (x <= 0 || y <= 0) return; // pannello nascosto / non ancora misurato: niente resize spurio
  box.setDimensions?.({ x, y });
}

onMounted(() => {
  // ResizeObserver assente in jsdom: degrada senza osservare (il resize 3D e' un miglioramento di resa).
  if (typeof ResizeObserver === 'undefined' || mountEl.value === null) return;
  resizeObserver = new ResizeObserver(() => {
    // Coalizza in un frame: il drag del pannello emette molti tick e setDimensions ricostruisce la scena.
    if (resizeRaf !== 0) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      syncSize();
    });
  });
  resizeObserver.observe(mountEl.value);
});

// Ri-triggera al cambio di nonce; anima i tiri standard IN SEQUENZA (roll() azzera+rimpiazza il box,
// quindi piu roll concorrenti si sovrascriverebbero: un turno attacco+effetto perderebbe un tiro).
watch(
  () => dice.nonce,
  () => {
    const notations = dice.rolls.map((r) => r.notation).filter((n): n is string => n !== null);
    if (notations.length === 0) return;
    void (async () => {
      for (const n of notations) {
        await animate(n);
      }
    })();
  },
);

onBeforeUnmount(() => {
  if (resizeRaf !== 0) cancelAnimationFrame(resizeRaf);
  resizeObserver?.disconnect();
  resizeObserver = null;
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
