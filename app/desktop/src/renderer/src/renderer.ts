import { createApp } from 'vue';
import App from './App.vue';
import type { ReadModelPush } from '@loomn/shared';

createApp(App).mount('#app');

// Boot normale (diagnostica; la UI vera e il Piano 10): sottoscrive i push read-side e li logga.
// In modalita self-test (gate 9c-ii) il renderer guida un giro IPC completo e logga un VERDICT.
const selfTest = new URLSearchParams(location.search).get('selftest');
if (selfTest === null) {
  window.loomn.onReadModelPush((push) => {
    console.log(`[renderer] read-model v${push.version}: ${Object.keys(push.state.actors).length} attori`);
  });
} else {
  void runSelfTest(selfTest);
}

// Self-test scriptabile (gate 9c-ii): NON-GUI, NON-rete. Esercita renderer->preload->main->service
// ->push. Logga un singolo VERDICT che il main cattura per uscire con codice 0 (PASS) / 1 (FAIL).
async function runSelfTest(phase: string): Promise<void> {
  const lines: string[] = [];
  const check = (cond: boolean, label: string): void => {
    lines.push(`${cond ? 'ok' : 'FAIL'} ${label}`);
  };
  // Cattura il primo snapshot read-side (spinto su did-finish-load): serve alla durabilita in fase 2.
  const firstPush = new Promise<ReadModelPush>((resolve) => {
    window.loomn.onReadModelPush((push) => resolve(push));
  });

  try {
    if (phase === '1') {
      const s0 = await window.loomn.getStatus();
      check(s0.version === 0, 'DB fresco a versione 0');
      check(s0.safeStorageAvailable, 'safeStorage disponibile');

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
    }

    const passed = lines.every((l) => l.startsWith('ok'));
    console.log(`VERDICT: ${passed ? 'PASS' : 'FAIL'} fase=${phase} [${lines.join('; ')}]`);
  } catch (err) {
    console.log(`VERDICT: FAIL fase=${phase} eccezione=${err instanceof Error ? err.message : String(err)}`);
  }
}
