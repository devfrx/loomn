<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useOnboardingStore } from '../../stores/onboarding';
import PanelError from '../PanelError.vue';

defineOptions({ name: 'BriefStep' });
const store = useOnboardingStore();
const router = useRouter();
const canGenerate = computed<boolean>(() => store.text.trim() !== '' && store.status !== 'generating');

function onNpcCount(raw: string): void {
  const n = Number(raw);
  store.npcCount = raw.trim() === '' || !Number.isFinite(n) ? null : n;
}
</script>

<template>
  <div class="brief">
    <h2>Nuova campagna</h2>
    <label class="field">Di cosa parla la tua campagna?
      <textarea v-model="store.text" rows="4" placeholder="Es. un equipaggio di contrabbandieri e una reliquia viva..."></textarea>
    </label>
    <label class="field">Nome (opzionale)
      <input v-model="store.name" type="text" placeholder="se lo lasci vuoto, lo propone l AI" />
    </label>
    <details class="advanced">
      <summary>Opzioni avanzate</summary>
      <label class="field">Generi <input v-model="store.genres" type="text" placeholder="fantasy, mistero" /></label>
      <label class="field">Tono <input v-model="store.tone" type="text" /></label>
      <label class="field">N. PNG chiave
        <input :value="store.npcCount ?? ''" type="number" min="0" @input="onNpcCount(($event.target as HTMLInputElement).value)" />
      </label>
      <label class="field">Guida ai contenuti <textarea v-model="store.contentGuidance" rows="2"></textarea></label>
    </details>
    <PanelError :error="store.error" />
    <div class="actions">
      <button v-if="store.error" class="link" type="button" @click="router.push('/impostazioni')">Vai a Impostazioni</button>
      <button class="generate" type="button" :disabled="!canGenerate" @click="store.generate()">
        {{ store.status === 'generating' ? 'Generazione…' : 'Genera bozza' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.brief { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-2); }
.actions { display: flex; justify-content: flex-end; gap: 12px; align-items: center; }

.generate {
  font-family: var(--f-sans);
  font-size: 13px;
  padding: 8px 16px;
  border-radius: var(--r-xs, 8px);
  border: none;
  background: var(--accent);
  color: var(--ink, #0c0d10);
  cursor: pointer;
  transition: opacity 0.15s, filter 0.15s;
}
.generate:hover:not(:disabled) { filter: brightness(1.08); }
.generate:disabled { opacity: 0.5; cursor: not-allowed; }

.link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-size: 13px;
  font-family: var(--f-sans);
}
.link:hover { text-decoration: underline; }
</style>
