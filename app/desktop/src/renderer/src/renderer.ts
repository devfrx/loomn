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
// I-02: pull-on-mount. Read-side self-healing: idrata lo store anche se il push e gia passato (Ctrl+R),
// indipendente dal timing del push. Nel reale post-reload pull e push sono alla stessa versione.
void window.loomn.getReadModel().then((push) => store.applyPush(push));

// Self-test scriptabile (gate, evoluzione del 9c-ii/Piano 0 sull app Vue reale): guidato da
// ?selftest=<fase>, NON-GUI per il resto. Logga un singolo VERDICT che il main cattura (exit 0/1).
const selfTest = new URLSearchParams(location.search).get('selftest');
if (selfTest !== null) {
  void runSelfTest(selfTest, store, router);
} else {
  // First-run (spec 10f): idrata lo status e guida a Impostazioni una volta se non configurato.
  void runFirstRun(router, useProviderStatusStore(pinia), useReadModelStore(pinia));
}

async function runSelfTest(
  phase: string,
  readModel: ReturnType<typeof useReadModelStore>,
  appRouter: Router,
): Promise<void> {
  const lines: string[] = [];
  // I-02 (copertura reload): chiave sessionStorage che sopravvive a un location.reload() ma non a un
  // riavvio-processo -> ci permette di forzare UN solo reload in fase 2 senza loop infinito.
  const RELOAD_FLAG = 'loomn-selftest-reloaded';
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
      check(s0.ok && s0.version === 0, 'DB fresco a versione 0');
      check(s0.ok && s0.safeStorageAvailable, 'safeStorage disponibile');
      check(s0.ok && s0.provider === undefined, 'nessun provider persistito a DB fresco');

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

      // 10e: Diario (narrazione + L2 + canon, read-only) e Compagnia (roster dal read-model + relazioni
      // canon) montano via le route reali e leggono i canali read del Piano 0. Read-only → nessun
      // evento, la versione resta invariata (la fase 2 verifica 7).
      await appRouter.push('/diario');
      check(appRouter.currentRoute.value.name === 'journal', 'router naviga al Diario (JournalView montato)');
      await appRouter.push('/compagnia');
      check(appRouter.currentRoute.value.name === 'company', 'router naviga alla Compagnia (CompanyView montato)');
      check(readModel.actors.some((a) => a.id === 'goblin'), 'la Compagnia vede il roster dal read-model');
      await appRouter.push('/');
      check(appRouter.currentRoute.value.name === 'game', 'router torna al Gioco');

      const hist = await window.loomn.getNarrationHistory({});
      check(hist.ok && hist.entries.length === 0 && hist.hasMore === false, 'narration history vuota a inizio');

      // 10b: il Gioco monta NarrativePanel/DicePanel (init dadi 3D LAZY, non parte nel gate). Dopo un
      // dispatch il read-model e caricato e la storia narrazione resta vuota (NarrationRecorded entra
      // nello stream solo via run-turn, qui non eseguito senza un LLM reale).
      check(readModel.loaded === true, 'read-model caricato (Gioco montato coi pannelli 10b)');
      const hist2 = await window.loomn.getNarrationHistory({ limit: 5 });
      check(hist2.ok && hist2.entries.length === 0, 'narration history coerente dopo il dispatch');

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
      check(s1.ok && s1.providerConfigured, 'provider configurato dopo set-provider');
      check(
        s1.ok &&
          s1.provider?.baseUrl === 'http://localhost:1234/v1' &&
          s1.provider?.model === 'local' &&
          s1.provider?.hasApiKey === true,
        'get-status espone il read-back provider dopo set-provider',
      );

      // Ri-salva cambiando solo il model, campo chiave OMESSO -> la chiave deve restare (tri-stato).
      const sp2 = await window.loomn.setProvider({ baseUrl: 'http://localhost:1234/v1', model: 'local-2' });
      check(sp2.ok, 'set-provider ri-salva senza chiave');
      const s2 = await window.loomn.getStatus();
      check(s2.ok && s2.provider?.model === 'local-2' && s2.provider?.hasApiKey === true, 'chiave mantenuta ri-salvando senza chiave');

      // 10c: slice combat via IPC reale. StartEncounter (nonCombatOnly, da exploration) entra in combat;
      // EndTurn avanza il turno; EndEncounter chiude e torna fuori combat. Prova il path combat end-to-end.
      const enc = await window.loomn.dispatch({
        type: 'StartEncounter',
        encounterId: 'scontro-selftest',
        participants: [{ actorId: 'goblin', zone: 'centro', initiative: 10 }],
      });
      check(enc.ok && enc.events.some((e) => e.type === 'EncounterStarted'), 'StartEncounter avvia lo scontro');
      check(
        enc.ok && enc.events.some((e) => e.type === 'PhaseChanged' && e.to === 'combat'),
        'StartEncounter entra in fase combat',
      );

      const et = await window.loomn.dispatch({ type: 'EndTurn' });
      check(et.ok && et.events.some((e) => e.type === 'TurnEnded'), 'EndTurn avanza il turno in combat');

      const ee = await window.loomn.dispatch({ type: 'EndEncounter' });
      check(ee.ok && ee.events.some((e) => e.type === 'EncounterEnded'), 'EndEncounter chiude lo scontro');
      check(
        ee.ok && ee.events.some((e) => e.type === 'PhaseChanged' && e.to === 'exploration'),
        'EndEncounter torna fuori combat',
      );

      // Comando GM via IPC (EnterPhase, non-combat): la fase passa da exploration a dialogue.
      const gm = await window.loomn.dispatch({ type: 'EnterPhase', to: 'dialogue' });
      check(gm.ok && gm.events.some((e) => e.type === 'PhaseChanged'), 'comando GM EnterPhase cambia fase');

      // I-02: il canale pull ritorna lo snapshot corrente (qui versione 8, dopo EnterPhase). Read-only.
      // Versione 8 (non 7): EndTurn su un solo partecipante chiude il round -> il motore auto-emette
      // RoundAdvanced (FSM di I-01/F1), un evento in piu rispetto al ladder pre-F1.
      const rmPull = await window.loomn.getReadModel();
      check(
        rmPull.version === 8 && rmPull.state.actors['goblin']?.name === 'Goblin',
        'get-read-model pull ritorna lo stato corrente (canale I-02)',
      );

      // 10d: la Scheda monta via la route reale (SheetPanel) e legge l attore dal read-model.
      // Read-only -> nessun evento, la versione resta 8 (la fase 2 lo verifica).
      await appRouter.push('/scheda');
      check(appRouter.currentRoute.value.name === 'sheet', 'router naviga alla Scheda (SheetPanel montato)');
      check(readModel.actors.some((a) => a.id === 'goblin'), 'la Scheda vede l attore dal read-model');
      await appRouter.push('/');
      check(appRouter.currentRoute.value.name === 'game', 'router torna al Gioco dopo la Scheda');
    } else {
      // I-02 (copertura del path RELOAD): la fase 2 (riavvio) e read-only e idempotente. Forziamo UN
      // solo location.reload() (equivalente a Ctrl+R) PRIMA delle verifiche, cosi OGNI asserzione di
      // persistenza qui sotto vale dopo un reload in-finestra. Chiude la lacuna che fece sfuggire I-02
      // al gate: il gate copriva solo il riavvio-processo (finestra nuova -> primo push regolare), MAI
      // il reload-in-finestra (did-finish-load rifira). Il reload non dispatcha -> la versione resta 8.
      if (sessionStorage.getItem(RELOAD_FLAG) !== '1') {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        location.reload();
        return; // niente VERDICT sul passaggio pre-reload: lo logghera il passaggio post-reload.
      }
      sessionStorage.removeItem(RELOAD_FLAG);

      const s0 = await window.loomn.getStatus();
      check(s0.ok && s0.version === 8, 'versione 8 PERSISTITA dopo riavvio + reload (durabilita: slice combat 10c + RoundAdvanced di I-01)');
      check(s0.ok && s0.providerConfigured, 'provider ricostruito da settings.json (chiave decifrata)');
      check(s0.ok && s0.provider?.hasApiKey === true, 'read-back provider con chiave persistito dopo riavvio');

      const push = await Promise.race([
        firstPush,
        new Promise<ReadModelPush>((_resolve, reject) =>
          setTimeout(() => reject(new Error('nessun read-model push')), 5000),
        ),
      ]);
      check(push.state.actors['goblin']?.name === 'Goblin', 'attore goblin sopravvissuto al riavvio');
      check(readModel.actors.some((a) => a.id === 'goblin'), 'store Pinia riflette lo stato persistito');

      // I-02: dopo il riavvio il pull ri-idrata lo stato persistito senza dipendere dal push.
      const rmPull = await window.loomn.getReadModel();
      check(
        rmPull.version === 8 && rmPull.state.actors['goblin']?.name === 'Goblin',
        'get-read-model pull ri-idrata dopo il riavvio (canale I-02)',
      );

      // I-02 (reload): in QUESTO passaggio post-reload NON e stato emesso alcun dispatch, eppure lo store
      // e a versione 8 col goblin -> dimostra il self-healing read-side dopo un Ctrl+R (pull-on-mount +
      // .on did-finish-load di F4). E esattamente la copertura che mancava al gate quando I-02 sfuggi.
      check(
        readModel.version === 8 && readModel.actors.some((a) => a.id === 'goblin'),
        'dopo il reload lo store si ri-popola SENZA dispatch (I-02 pull-on-mount + .on did-finish-load)',
      );
    }

    const passed = lines.every((l) => l.startsWith('ok'));
    console.log(`VERDICT: ${passed ? 'PASS' : 'FAIL'} fase=${phase} [${lines.join('; ')}]`);
  } catch (err) {
    console.log(`VERDICT: FAIL fase=${phase} eccezione=${err instanceof Error ? err.message : String(err)}`);
  }
}
