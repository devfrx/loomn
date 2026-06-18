<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import LoomnPanel from './LoomnPanel.vue';
import LoomnButton from './LoomnButton.vue';
import { useReadModelStore } from '../stores/read-model';
import { useRulesetStore } from '../stores/ruleset';
import { useDispatch } from '../composables/use-dispatch';
import { toEncounterView } from '../lib/encounter-view';
import { buildAttack, endTurn, nextRound, endEncounter } from '../lib/combat-commands';
import type { DispatchCommand } from '@loomn/shared';

const store = useReadModelStore();
const ruleset = useRulesetStore();
// use-dispatch: dispaccia il Command E accoda i RollResult degli events alla coda dadi (seam 10b).
const { dispatch } = useDispatch();

onMounted(() => void ruleset.load());

const view = computed(() => (store.encounter ? toEncounterView(store.encounter, store.actors) : null));
const vocab = computed(() => ruleset.vocabulary);
const feedback = ref<{ kind: 'ok' | 'error'; msg: string } | null>(null);

// Affordance Attacco: l attaccante e il partecipante di turno (view.current); il bersaglio e gli altri.
const atk = reactive({ targetId: '', defense: '', defenseBase: 10, damageResource: '' });
const targets = computed(() =>
  view.value ? view.value.order.filter((r) => r.actorId !== view.value?.current?.actorId) : [],
);
const canAttack = computed(
  () => Boolean(view.value?.current) && atk.targetId !== '' && atk.defense !== '' && atk.damageResource !== '',
);

async function send(command: DispatchCommand): Promise<void> {
  feedback.value = null;
  const res = await dispatch(command);
  feedback.value = res.ok ? { kind: 'ok', msg: 'Comando applicato.' } : { kind: 'error', msg: res.error };
}

function attack(): void {
  const attacker = view.value?.current;
  if (attacker === null || attacker === undefined) return;
  // buildAttack ritorna un literal PLAIN (mai il proxy reactive di atk): clone IPC sicura (lezione 10b).
  void send(
    buildAttack({
      attackerId: attacker.actorId,
      targetId: atk.targetId,
      defense: atk.defense,
      defenseBase: atk.defenseBase,
      damageResource: atk.damageResource,
    }),
  );
}
</script>

<template>
  <LoomnPanel title="Scontro" eyebrow="combattimento" :meta="view ? `round ${view.round}` : ''">
    <div v-if="view" class="cockpit">
      <p class="cockpit__turn">Turno di <strong>{{ view.current?.name ?? '-' }}</strong></p>

      <ol class="order">
        <li
          v-for="row in view.order"
          :key="row.actorId"
          class="order__row"
          :class="{ 'order__row--current': row.isCurrent, 'order__row--downed': row.isDowned }"
        >
          <span class="order__init">{{ row.initiative }}</span>
          <span class="order__name">{{ row.name }}</span>
          <span class="order__res">
            <template v-for="r in row.resources" :key="r.key">{{ r.key }} {{ r.current }}/{{ r.max }} </template>
          </span>
          <span v-if="row.actedThisRound" class="order__tag">agito</span>
          <span v-if="row.isDowned" class="order__tag order__tag--bad">a terra</span>
        </li>
      </ol>

      <div class="zones">
        <div v-for="z in view.zones" :key="z.zone" class="zones__group">
          <span class="zones__label">{{ z.zone }}</span>
          <span class="zones__members">{{ z.participants.map((p) => p.name).join(', ') }}</span>
        </div>
      </div>

      <div class="actions">
        <LoomnButton variant="solid" @click="send(endTurn())">Fine turno</LoomnButton>
        <LoomnButton variant="ghost" @click="send(nextRound())">Round successivo</LoomnButton>
        <LoomnButton variant="ghost" @click="send(endEncounter())">Termina scontro</LoomnButton>
      </div>

      <div class="attack">
        <h4 class="attack__title">Attacco</h4>
        <div class="attack__row">
          <select v-model="atk.targetId" class="inp" aria-label="bersaglio">
            <option value="">bersaglio</option>
            <option v-for="t in targets" :key="t.actorId" :value="t.actorId">{{ t.name }}</option>
          </select>
          <select v-model="atk.defense" class="inp" aria-label="difesa">
            <option value="">difesa</option>
            <option v-for="d in vocab?.defenses ?? []" :key="d" :value="d">{{ d }}</option>
          </select>
          <input v-model.number="atk.defenseBase" class="inp" type="number" aria-label="defenseBase" />
          <select v-model="atk.damageResource" class="inp" aria-label="risorsa danno">
            <option value="">risorsa</option>
            <option v-for="r in vocab?.resources ?? []" :key="r" :value="r">{{ r }}</option>
          </select>
          <LoomnButton variant="solid" :disabled="!canAttack" @click="attack">Attacca</LoomnButton>
        </div>
      </div>

      <p v-if="feedback" class="cockpit__feedback" :class="`cockpit__feedback--${feedback.kind}`">{{ feedback.msg }}</p>
    </div>
    <p v-else class="cockpit__empty">Nessuno scontro attivo.</p>
  </LoomnPanel>
</template>

<style scoped>
.cockpit { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; }
.cockpit__turn { margin: 0; font-size: 13px; color: var(--text-2); }
.cockpit__turn strong { color: var(--text); font-family: var(--f-display); }
.order { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; overflow: auto; min-height: 0; }
.order__row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.order__row--current { border-color: var(--accent); background: var(--accent-dim); }
.order__row--downed { opacity: 0.55; }
.order__init { font-family: var(--f-mono); font-size: 13px; color: var(--accent); min-width: 26px; text-align: right; }
.order__name { color: var(--text); flex: 1; }
.order__res { font-family: var(--f-mono); font-size: 11px; color: var(--text-3); }
.order__tag { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
.order__tag--bad { color: var(--bad); }
.zones { display: flex; flex-wrap: wrap; gap: 8px; }
.zones__group { display: flex; flex-direction: column; gap: 2px; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--panel); }
.zones__label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
.zones__members { font-size: 12px; color: var(--text-2); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.attack { border-top: 1px solid var(--line); padding-top: 10px; }
.attack__title { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-2); }
.attack__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.inp { font: inherit; font-family: var(--f-mono); font-size: 12px; color: var(--text); background: var(--panel); border: 1px solid var(--line-2); border-radius: 8px; padding: 6px 9px; }
.inp[type='number'] { width: 64px; }
.cockpit__feedback { font-size: 12px; margin: 0; }
.cockpit__feedback--ok { color: var(--accent); }
.cockpit__feedback--error { color: var(--bad); }
.cockpit__empty { color: var(--text-3); font-size: 13px; }
</style>
