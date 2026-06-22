<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import LoomnButton from './LoomnButton.vue';
import PanelError from './PanelError.vue';
import { useReadModelStore } from '../stores/read-model';
import { useRulesetStore } from '../stores/ruleset';
import { useDispatch } from '../composables/use-dispatch';
import { GM_COMMANDS, isGmCommandEnabled, type GmCommandType } from '../lib/gm-commands';
import { buildStartEncounter } from '../lib/combat-commands';
import type { DispatchCommand } from '@loomn/shared';
type RequestCheckCmd = Extract<DispatchCommand, { type: 'RequestCheck' }>;
type ApplyEffectCmd = Extract<DispatchCommand, { type: 'ApplyEffect' }>;
type AdvanceQuestCmd = Extract<DispatchCommand, { type: 'AdvanceQuest' }>;
type EnterPhaseCmd = Extract<DispatchCommand, { type: 'EnterPhase' }>;

const store = useReadModelStore();
const ruleset = useRulesetStore();
const { dispatch } = useDispatch();
const open = ref(false);
const feedback = ref<{ kind: 'ok' | 'error'; msg: string } | null>(null);

onMounted(() => void ruleset.load());

const labels: Record<GmCommandType, string> = {
  RequestCheck: 'Richiedi prova',
  ApplyEffect: 'Applica effetto',
  StartQuest: 'Avvia quest',
  AdvanceQuest: 'Avanza quest',
  EnterPhase: 'Cambia fase',
  StartEncounter: 'Avvia scontro',
};

function enabled(type: GmCommandType): boolean {
  return isGmCommandEnabled(type, store.phase, ruleset.commandPhaseRules);
}

const rc = reactive({ actorId: '', attribute: '', skill: '', difficulty: '' });
const ae = reactive({ targetId: '', resource: '', direction: '', count: 1, sides: 6, bonus: 0 });
const sq = reactive({ id: '', title: '', description: '' });
const aq = reactive({ questId: '', status: '' });
const ep = reactive({ to: '' });

interface SeRow {
  actorId: string;
  name: string;
  include: boolean;
  initiative: number;
  zone: string;
}
const seRows = ref<SeRow[]>([]);
// Ricostruisce le righe quando il roster cambia, preservando le scelte gia fatte per attore.
watch(
  () => store.actors,
  (actors) => {
    const prev = new Map(seRows.value.map((r) => [r.actorId, r]));
    seRows.value = actors.map((a) => {
      const p = prev.get(a.id);
      return {
        actorId: a.id,
        name: a.name,
        include: p?.include ?? false,
        initiative: p?.initiative ?? 10,
        zone: p?.zone ?? 'centro',
      };
    });
  },
  { immediate: true },
);

const anyIncluded = computed(() => seRows.value.some((r) => r.include));

function submitStartEncounter(): void {
  // buildStartEncounter ritorna un literal PLAIN (mai i proxy reactive di seRows): clone IPC sicura.
  const cmd = buildStartEncounter(
    `scontro-${store.version}`,
    seRows.value.map((r) => ({ actorId: r.actorId, include: r.include, initiative: r.initiative, zone: r.zone })),
  );
  if (cmd === null) {
    feedback.value = { kind: 'error', msg: 'Seleziona almeno un partecipante.' };
    return;
  }
  void send(cmd);
}

async function send(command: DispatchCommand): Promise<void> {
  feedback.value = null;
  // dispatch del composable: applica il Command E accoda al pannello dadi i tiri prodotti.
  const res = await dispatch(command);
  feedback.value = res.ok ? { kind: 'ok', msg: 'Comando applicato.' } : { kind: 'error', msg: res.error };
}

function submitRequestCheck(): void {
  void send({
    type: 'RequestCheck',
    actorId: rc.actorId,
    difficulty: rc.difficulty as RequestCheckCmd['difficulty'],
    ...(rc.attribute ? { attribute: rc.attribute } : {}),
    ...(rc.skill ? { skill: rc.skill } : {}),
  });
}
function submitApplyEffect(): void {
  void send({
    type: 'ApplyEffect',
    targetId: ae.targetId,
    resource: ae.resource,
    direction: ae.direction as ApplyEffectCmd['direction'],
    dice: [{ count: ae.count, sides: ae.sides }],
    ...(ae.bonus ? { bonus: ae.bonus } : {}),
  });
}
function submitStartQuest(): void {
  void send({ type: 'StartQuest', id: sq.id, title: sq.title, ...(sq.description ? { description: sq.description } : {}) });
}
function submitAdvanceQuest(): void {
  void send({ type: 'AdvanceQuest', questId: aq.questId, status: aq.status as AdvanceQuestCmd['status'] });
}
function submitEnterPhase(): void {
  void send({ type: 'EnterPhase', to: ep.to as EnterPhaseCmd['to'] });
}

const v = computed(() => ruleset.vocabulary);
</script>

<template>
  <div class="gm">
    <LoomnButton variant="ghost" @click="open = true; feedback = null">Regia</LoomnButton>
    <div v-if="open" class="gm__scrim" @click.self="open = false">
      <aside class="gm__panel" role="dialog" aria-modal="true" aria-label="Regia">
        <header class="gm__head">
          <span class="gm__title">Regia</span>
          <button class="gm__close" type="button" aria-label="chiudi" @click="open = false">&#x2715;</button>
        </header>

        <p v-if="feedback" class="gm__feedback" :class="`gm__feedback--${feedback.kind}`">{{ feedback.msg }}</p>
        <PanelError :error="ruleset.error" />

        <section v-for="type in GM_COMMANDS" :key="type" class="cmd" :class="{ 'cmd--disabled': !enabled(type) }">
          <h4 class="cmd__title">{{ labels[type] }}</h4>
          <fieldset :disabled="!enabled(type)" class="cmd__body">
            <template v-if="type === 'RequestCheck'">
              <select v-model="rc.actorId" class="inp"><option value="">attore</option><option v-for="a in store.actors" :key="a.id" :value="a.id">{{ a.name }}</option></select>
              <select v-model="rc.attribute" class="inp"><option value="">attributo</option><option v-for="x in v?.attributes ?? []" :key="x" :value="x">{{ x }}</option></select>
              <select v-model="rc.skill" class="inp"><option value="">abilita</option><option v-for="x in v?.skills ?? []" :key="x" :value="x">{{ x }}</option></select>
              <select v-model="rc.difficulty" class="inp"><option value="">difficolta</option><option v-for="d in ruleset.difficulties" :key="d" :value="d">{{ d }}</option></select>
              <LoomnButton variant="solid" :disabled="!rc.actorId || !rc.difficulty" @click="submitRequestCheck">Esegui</LoomnButton>
            </template>

            <template v-else-if="type === 'ApplyEffect'">
              <select v-model="ae.targetId" class="inp"><option value="">bersaglio</option><option v-for="a in store.actors" :key="a.id" :value="a.id">{{ a.name }}</option></select>
              <select v-model="ae.resource" class="inp"><option value="">risorsa</option><option v-for="r in v?.resources ?? []" :key="r" :value="r">{{ r }}</option></select>
              <select v-model="ae.direction" class="inp"><option value="">direzione</option><option v-for="d in ruleset.directions" :key="d" :value="d">{{ d }}</option></select>
              <input v-model.number="ae.count" class="inp" type="number" aria-label="count" />
              <input v-model.number="ae.sides" class="inp" type="number" aria-label="sides" />
              <input v-model.number="ae.bonus" class="inp" type="number" aria-label="bonus" />
              <LoomnButton variant="solid" :disabled="!ae.targetId || !ae.resource || !ae.direction || !ae.count || !ae.sides" @click="submitApplyEffect">Applica</LoomnButton>
            </template>

            <template v-else-if="type === 'StartQuest'">
              <input v-model="sq.id" class="inp" placeholder="id" />
              <input v-model="sq.title" class="inp" placeholder="titolo" />
              <input v-model="sq.description" class="inp" placeholder="descrizione (opz)" />
              <LoomnButton variant="solid" :disabled="!sq.id || !sq.title" @click="submitStartQuest">Avvia</LoomnButton>
            </template>

            <template v-else-if="type === 'AdvanceQuest'">
              <select v-model="aq.questId" class="inp"><option value="">quest</option><option v-for="q in store.quests" :key="q.id" :value="q.id">{{ q.title }}</option></select>
              <select v-model="aq.status" class="inp"><option value="">esito</option><option v-for="o in ruleset.questOutcomes" :key="o" :value="o">{{ o }}</option></select>
              <LoomnButton variant="solid" :disabled="!aq.questId || !aq.status" @click="submitAdvanceQuest">Avanza</LoomnButton>
            </template>

            <template v-else-if="type === 'EnterPhase'">
              <select v-model="ep.to" class="inp"><option value="">fase</option><option v-for="p in ruleset.softPhases" :key="p" :value="p">{{ p }}</option></select>
              <LoomnButton variant="solid" :disabled="!ep.to" @click="submitEnterPhase">Cambia</LoomnButton>
            </template>

            <template v-else-if="type === 'StartEncounter'">
              <p v-if="!seRows.length" class="cmd__hint">Nessun attore: crealo in Compagnia.</p>
              <div v-for="row in seRows" :key="row.actorId" class="se-row">
                <label class="se-row__inc"><input v-model="row.include" type="checkbox" /> {{ row.name }}</label>
                <input v-model.number="row.initiative" class="inp" type="number" aria-label="iniziativa" />
                <input v-model="row.zone" class="inp" aria-label="zona" />
              </div>
              <LoomnButton variant="solid" :disabled="!anyIncluded" @click="submitStartEncounter">Avvia scontro</LoomnButton>
            </template>
          </fieldset>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.gm { display: inline-flex; }
.gm__scrim { position: fixed; inset: 0; background: rgba(7, 8, 9, 0.6); display: flex; justify-content: flex-end; z-index: 50; }
.gm__panel { width: 380px; max-width: 92vw; height: 100%; overflow: auto; background: var(--panel); border-left: 1px solid var(--line-2); padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.gm__head { display: flex; align-items: center; justify-content: space-between; }
.gm__title { font-family: var(--f-display); font-size: 18px; color: var(--text); }
.gm__close { background: none; border: none; color: var(--text-3); cursor: pointer; padding: 4px 6px; line-height: 1; }
.gm__feedback { font-size: 12px; }
.gm__feedback--ok { color: var(--accent); }
.gm__feedback--error { color: var(--bad); }
.cmd { padding: 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--well); }
.cmd--disabled { opacity: 0.45; }
.cmd__title { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-2); margin: 0 0 10px; }
.cmd__body { border: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.inp { font: inherit; font-family: var(--f-mono); font-size: 12px; color: var(--text); background: var(--panel); border: 1px solid var(--line-2); border-radius: 8px; padding: 6px 9px; }
.inp[type='number'] { width: 64px; }
.cmd__hint { font-size: 11px; color: var(--text-3); margin: 0; }
.se-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.se-row__inc { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text); flex: 1; }
</style>
