import { createApp } from 'vue';
import { createPinia } from 'pinia';
import type { Router } from 'vue-router';
import type { ReadModelPush } from '@loomn/shared';
import App from './App.vue';
import { createAppRouter } from './router';
import { useReadModelStore } from './stores/read-model';
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
if (selfTest !== null) void runSelfTest(selfTest, store, router);

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

      const sp = await window.loomn.setProvider({
        baseUrl: 'http://localhost:1234/v1',
        model: 'local',
        apiKey: 'sk-selftest',
      });
      check(sp.ok, 'set-provider ok (chiave cifrata con safeStorage)');

      const s1 = await window.loomn.getStatus();
      check(s1.providerConfigured, 'provider configurato dopo set-provider');
    } else {
      const s0 = await window.loomn.getStatus();
      check(s0.version === 1, 'versione 1 PERSISTITA dopo il riavvio (durabilita su disco)');
      check(s0.providerConfigured, 'provider ricostruito da settings.json (chiave decifrata)');

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
