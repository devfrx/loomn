import { createApp } from 'vue';
import { createPinia } from 'pinia';
import type { Router } from 'vue-router';
import type { ReadModelPush } from '@loomn/shared';
import App from './App.vue';
import { createAppRouter } from './router';
import { useReadModelStore } from './stores/read-model';
import { useProviderStatusStore } from './stores/provider-status';
import { runFirstRun } from './composables/use-first-run';
import './styles';

const pinia = createPinia();
const router = createAppRouter();
const app = createApp(App);
app.use(pinia);
app.use(router);
app.mount('#app');

// Lo store usa la pinia appena creata. La sottoscrizione al push read-side e l UNICA via per cui lo
// stato entra nel renderer (spec 5.2): il main spinge {version, state}, lo store proietta.
const store = useReadModelStore(pinia);
window.loomn.onReadModelPush((push) => store.applyPush(push));

// Self-test scriptabile (gate, evoluzione del 9c-ii/Piano 0 sull app Vue reale): guidato da
// ?selftest=<fase>, NON-GUI per il resto. Logga un singolo VERDICT che il main cattura (exit 0/1).
const selfTest = new URLSearchParams(location.search).get('selftest');
if (selfTest !== null) {
  void runSelfTest(selfTest, store, router);
} else {
  // First-run (spec 10f): idrata lo status e guida a Impostazioni una volta se non configurato.
  void runFirstRun(router, useProviderStatusStore(pinia));
}

async function runSelfTest(
  phase: string,
  readModel: ReturnType<typeof useReadModelStore>,
  appRouter: Router,
): Promise<void> {
  const lines: string[] = [];
  const check = (cond: boolean, label: string): void => {
    lines.push(`${cond ? 'ok' : 'FAIL'} ${label}`);
  };
  // Cattura il primo push read-side (spinto su did-finish-load): serve alla durabilita in fase 2.
  const firstPush = new Promise<ReadModelPush>((resolve) => {
    window.loomn.onReadModelPush((push) => resolve(push));
  });

  try {
    if (phase === '1') {
      const s0 = await window.loomn.getStatus();
      check(s0.version === 0, 'DB fresco a versione 0');
      check(s0.safeStorageAvailable, 'safeStorage disponibile');
      check(s0.provider === undefined, 'nessun provider persistito a DB fresco');

      // Attende il push prodotto dal dispatch -> verifica che lo store Pinia lo proietti.
      const pushed = new Promise<ReadModelPush>((resolve) => {
        const off = window.loomn.onReadModelPush((p) => {
          if (p.version >= 1) {
            off();
            resolve(p);
          }
        });
      });

      const d = await window.loomn.dispatch({
        type: 'AddActor',
        actor: {
          id: 'goblin',
          name: 'Goblin',
          kind: 'npc',
          attributes: {},
          skills: {},
          resources: { hp: { current: 10, max: 10 } },
          conditions: [],
          items: [],
          progression: { xp: 0, level: 1 },
        },
      });
      check(d.ok && d.version === 1, 'dispatch AddActor porta a versione 1');
      check(d.ok && d.events.some((e) => e.type === 'ActorAdded'), 'dispatch espone gli events (ActorAdded)');

      const p = await Promise.race([
        pushed,
        new Promise<ReadModelPush>((_r, reject) =>
          setTimeout(() => reject(new Error('nessun push dopo dispatch')), 5000),
        ),
      ]);
      check(p.state.actors['goblin']?.name === 'Goblin', 'read-model push ricevuto dopo dispatch');
      check(readModel.version === 1 && readModel.actors.length === 1, 'store Pinia riflette il push read-side');

      await appRouter.push('/diario');
      check(appRouter.currentRoute.value.name === 'journal', 'router naviga al Diario');
      await appRouter.push('/');
      check(appRouter.currentRoute.value.name === 'game', 'router torna al Gioco');

      const hist = await window.loomn.getNarrationHistory({});
      check(hist.ok && hist.entries.length === 0 && hist.hasMore === false, 'narration history vuota a inizio');

      const canon = await window.loomn.getCanon({});
      check(canon.ok && canon.facts.length === 0, 'canon vuoto a inizio');

      const sums = await window.loomn.getSummaries({});
      check(sums.ok && sums.summaries.length === 0, 'summaries vuoti a inizio');

      const rs = await window.loomn.getRuleset();
      check(rs.ok && rs.vocabulary.attributes.includes('forza'), 'get-ruleset espone gli attributi del vocabolario');
      check(rs.ok && rs.vocabulary.resources.includes('hp'), 'get-ruleset espone le risorse del vocabolario');
      check(rs.ok && rs.difficulties.includes('moderate'), 'get-ruleset espone le difficolta');
      check(
        rs.ok &&
          rs.commandPhaseRules.combatOnly.includes('Attack') &&
          rs.commandPhaseRules.nonCombatOnly.includes('StartEncounter'),
        'get-ruleset espone le regole di legalita-per-fase',
      );

      const sp = await window.loomn.setProvider({
        baseUrl: 'http://localhost:1234/v1',
        model: 'local',
        apiKey: 'sk-selftest',
      });
      check(sp.ok, 'set-provider ok (chiave cifrata con safeStorage)');

      const s1 = await window.loomn.getStatus();
      check(s1.providerConfigured, 'provider configurato dopo set-provider');
      check(
        s1.provider?.baseUrl === 'http://localhost:1234/v1' &&
          s1.provider?.model === 'local' &&
          s1.provider?.hasApiKey === true,
        'get-status espone il read-back provider dopo set-provider',
      );

      // Ri-salva cambiando solo il model, campo chiave OMESSO -> la chiave deve restare (tri-stato).
      const sp2 = await window.loomn.setProvider({ baseUrl: 'http://localhost:1234/v1', model: 'local-2' });
      check(sp2.ok, 'set-provider ri-salva senza chiave');
      const s2 = await window.loomn.getStatus();
      check(s2.provider?.model === 'local-2' && s2.provider?.hasApiKey === true, 'chiave mantenuta ri-salvando senza chiave');

      // Comando GM via IPC (EnterPhase, non-combat): la fase passa da exploration a dialogue.
      const gm = await window.loomn.dispatch({ type: 'EnterPhase', to: 'dialogue' });
      check(gm.ok && gm.events.some((e) => e.type === 'PhaseChanged'), 'comando GM EnterPhase cambia fase');
    } else {
      const s0 = await window.loomn.getStatus();
      check(s0.version === 2, 'versione 2 PERSISTITA dopo il riavvio (durabilita su disco)');
      check(s0.providerConfigured, 'provider ricostruito da settings.json (chiave decifrata)');
      check(s0.provider?.hasApiKey === true, 'read-back provider con chiave persistito dopo riavvio');

      const push = await Promise.race([
        firstPush,
        new Promise<ReadModelPush>((_resolve, reject) =>
          setTimeout(() => reject(new Error('nessun read-model push')), 5000),
        ),
      ]);
      check(push.state.actors['goblin']?.name === 'Goblin', 'attore goblin sopravvissuto al riavvio');
      check(readModel.actors.some((a) => a.id === 'goblin'), 'store Pinia riflette lo stato persistito');
    }

    const passed = lines.every((l) => l.startsWith('ok'));
    console.log(`VERDICT: ${passed ? 'PASS' : 'FAIL'} fase=${phase} [${lines.join('; ')}]`);
  } catch (err) {
    console.log(`VERDICT: FAIL fase=${phase} eccezione=${err instanceof Error ? err.message : String(err)}`);
  }
}
