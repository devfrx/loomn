<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import LoomnPanel from '../components/LoomnPanel.vue';
import LoomnButton from '../components/LoomnButton.vue';
import { useProviderStatusStore } from '../stores/provider-status';
import { useReadModelStore } from '../stores/read-model';
import { buildProviderPayload, type ProviderFormState } from '../lib/provider-form';
import { useTheme } from '../composables/use-theme';

const status = useProviderStatusStore();
const router = useRouter();
const readModel = useReadModelStore();
const themeCtl = useTheme();

const form = reactive<ProviderFormState>({ baseUrl: '', model: '', keyAction: 'keep', keyInput: '' });
const feedback = ref<{ kind: 'ok' | 'error'; msg: string } | null>(null);
const saving = ref(false);

const hasApiKey = computed<boolean>(() => status.provider?.hasApiKey ?? false);

/** Pre-compila il form dal read-back; keyAction default = keep se c e una chiave, altrimenti set. */
function hydrateFromStatus(): void {
  form.baseUrl = status.provider?.baseUrl ?? '';
  form.model = status.provider?.model ?? '';
  form.keyAction = hasApiKey.value ? 'keep' : 'set';
  form.keyInput = '';
}

onMounted(async () => {
  if (!status.loaded) await status.refresh();
  hydrateFromStatus();
});
// Re-idrata dal read-back a ogni cambio di provider. refresh() e chiamato solo al boot e dopo un
// save ok -> post-save i campi tornano in sync col server (la password si svuota). Nessun clobber
// durante la digitazione: nessun altro percorso chiama refresh().
watch(() => status.provider, hydrateFromStatus);

const canSave = computed<boolean>(() => form.baseUrl.trim() !== '' && form.model.trim() !== '');

async function save(): Promise<void> {
  if (!canSave.value || saving.value) return;
  feedback.value = null;
  saving.value = true;
  try {
    const res = await window.loomn.setProvider(buildProviderPayload(form));
    if (res.ok) {
      await status.refresh();
      feedback.value = { kind: 'ok', msg: 'Provider salvato.' };
      // D-01c: provider appena configurato e nessuna campagna -> porta all onboarding.
      const push = await window.loomn.getReadModel();
      readModel.applyPush(push);
      if (!readModel.hasCampaign) await router.push('/nuova-campagna');
    } else {
      feedback.value = { kind: 'error', msg: res.error };
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <main class="route-view">
    <LoomnPanel eyebrow="impostazioni" title="Provider AI">
      <p v-if="!status.providerConfigured" class="intro">
        Configura un provider AI per dare voce al Master: senza, il gioco resta giocabile (creazione
        PG, regia) ma il turno narrativo e disabilitato.
      </p>

      <div class="form">
        <label class="field">
          <span class="field__label">Base URL</span>
          <input v-model="form.baseUrl" class="field__input" type="text" placeholder="http://localhost:1234/v1" />
        </label>

        <label class="field">
          <span class="field__label">Model</span>
          <input v-model="form.model" class="field__input" type="text" placeholder="local-model" />
        </label>

        <fieldset class="field">
          <legend class="field__label">Chiave API</legend>
          <template v-if="hasApiKey">
            <div class="key-modes">
              <label><input v-model="form.keyAction" type="radio" value="keep" /> Mantieni</label>
              <label><input v-model="form.keyAction" type="radio" value="set" /> Sostituisci</label>
              <label><input v-model="form.keyAction" type="radio" value="remove" /> Rimuovi</label>
            </div>
            <span class="key-hint">Chiave configurata. Lascia mantieni per non toccarla.</span>
          </template>
          <input
            v-if="form.keyAction === 'set'"
            v-model="form.keyInput"
            class="field__input"
            type="password"
            autocomplete="off"
            placeholder="sk-... (vuoto = nessuna chiave)"
          />
        </fieldset>

        <div class="actions">
          <LoomnButton variant="solid" :disabled="!canSave || saving" @click="save">Salva</LoomnButton>
          <span v-if="feedback" class="feedback" :class="`feedback--${feedback.kind}`">{{ feedback.msg }}</span>
        </div>
      </div>

      <dl class="diag">
        <div><dt>safeStorage</dt><dd>{{ status.safeStorageAvailable ? 'disponibile' : 'non disponibile' }}</dd></div>
        <div><dt>provider</dt><dd>{{ status.providerConfigured ? 'configurato' : 'non configurato' }}</dd></div>
      </dl>

      <fieldset class="field">
        <legend class="field__label">Tema</legend>
        <div class="key-modes">
          <label><input type="radio" name="theme" :checked="themeCtl.theme.value === 'system'" @change="themeCtl.set('system')" /> Sistema</label>
          <label><input data-test="theme-light" type="radio" name="theme" :checked="themeCtl.theme.value === 'light'" @change="themeCtl.set('light')" /> Chiaro</label>
          <label><input data-test="theme-dark" type="radio" name="theme" :checked="themeCtl.theme.value === 'dark'" @change="themeCtl.set('dark')" /> Scuro</label>
        </div>
      </fieldset>
    </LoomnPanel>
  </main>
</template>

<style scoped>
.route-view { flex: 1; min-height: 0; }
.intro { color: var(--text-2); margin-bottom: 16px; max-width: 60ch; }
.form { display: flex; flex-direction: column; gap: 14px; max-width: 480px; }
.field { display: flex; flex-direction: column; gap: 6px; border: none; padding: 0; margin: 0; }
.field__label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
legend.field__label { padding: 0; }
.field__input {
  font: inherit; font-family: var(--f-mono); font-size: 13px; color: var(--text);
  background: var(--well); border: 1px solid var(--line-2); border-radius: 10px; padding: 9px 12px;
}
.field__input:focus { outline: none; border-color: var(--accent); }
.key-modes { display: flex; gap: 16px; font-size: 12px; color: var(--text-2); }
.key-hint { font-size: 11px; color: var(--text-3); }
.actions { display: flex; align-items: center; gap: 14px; margin-top: 4px; }
.feedback { font-size: 12px; }
.feedback--ok { color: var(--accent); }
.feedback--error { color: var(--bad); }
.diag { margin-top: 22px; display: flex; gap: 22px; font-size: 12px; color: var(--text-3); }
.diag dt { text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; }
.diag dd { font-family: var(--f-mono); color: var(--text-2); margin: 2px 0 0; }
</style>
