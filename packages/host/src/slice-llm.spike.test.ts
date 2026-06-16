// slice-llm.spike.test.ts — THROWAWAY (branch spike/slice-llm). Spike di VALIDAZIONE (Traccia B):
// gioca alcuni turni reali contro un LLM vero (LM Studio) e dumpa le osservazioni grezze, per
// scoprire se gli strati di memoria (L1/L1.5/L2, Reflection, Context Assembler) e la pipeline
// Master si comportano come il design assume. NON e un test di regressione: non asserisce esiti
// del modello (non deterministici). Guardato da LOOMN_SPIKE=1 -> inerte in `pnpm test` (266 verdi,
// zero rete). Lancio: LOOMN_SPIKE=1 pnpm exec vitest run packages/host/src/slice-llm.spike.test.ts
import { describe, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Actor, Command } from '@loomn/engine';
import {
  buildSession,
  observeToolCalls,
  renderPrompt,
  renderSnapshot,
  renderStream,
  renderToolObservations,
  renderTracer,
  snapshotMemory,
  type SpyCall,
} from './slice-harness';

const ENABLED = process.env['LOOMN_SPIKE'] === '1';
const BASE_URL = process.env['LOOMN_BASE_URL'] ?? 'http://localhost:1234/v1';
const MODEL = process.env['LOOMN_MODEL'] ?? 'google/gemma-4-12b-qat';

/** Il personaggio del giocatore: esiste prima del gioco (setup deterministico, non lo crea l AI). */
function pc(): Actor {
  return {
    id: 'pc-eldra',
    name: 'Eldra',
    kind: 'pc',
    attributes: { forza: 3, destrezza: 2 },
    skills: { lame: 2 },
    resources: { hp: { current: 20, max: 20 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

// Scenari: spawn PNG -> attacco (combattimento deterministico) -> fatto narrato (da promuovere a
// canone). Coprono le 5 tool-call e il write path della Reflection.
const SCENARIO: string[] = [
  'Una mercante goblin di nome Krix entra nella locanda, si siede al mio tavolo e mi propone un affare losco.',
  'Senza preavviso sguaino la spada e attacco Krix.',
  'Krix, ferita, implora pieta e rivela di servire il Barone Vhalmar di Pietranera.',
];

describe.skipIf(!ENABLED)('slice giocabile — validazione memoria+AI con LLM reale', () => {
  it(
    'gioca alcuni turni reali, riflette, e dumpa le osservazioni',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'loomn-spike-'));
      const dbPath = join(dir, 'slice.db');
      const session = buildSession({ baseUrl: BASE_URL, model: MODEL, dbPath });
      const sections: string[] = [];
      sections.push(
        `# Slice LLM — osservazioni grezze\n\nModel: \`${MODEL}\` · baseUrl: \`${BASE_URL}\` · db: \`${dbPath}\``,
      );

      try {
        // Setup deterministico: il PG esiste prima del gioco.
        const seed: Command = { type: 'AddActor', actor: pc() };
        const seedOut = await session.service.dispatch(seed);
        sections.push(`## Setup\nPG seedato: Eldra (hp 20/20). Versione -> ${seedOut.readModel.version}.`);

        // Turni reali (ognuno isolato: un errore di un turno non blocca lo spike).
        let cursor = 0;
        for (let i = 0; i < SCENARIO.length; i++) {
          const action = SCENARIO[i] ?? '';
          const turnSection: string[] = [`## Turno ${i + 1}`, `**Azione giocatore:** ${action}`];
          try {
            const turn = await session.service.runTurn(action);
            turnSection.push(
              `**Narrazione:** ${turn.narration.length > 0 ? turn.narration : '_(vuota)_'}`,
              `**Event reali prodotti:** ${turn.events.length > 0 ? '`' + JSON.stringify(turn.events) + '`' : '_(nessuno)_'}`,
              `**Versione dopo il turno:** ${turn.readModel.version}`,
            );
          } catch (e) {
            turnSection.push(`**ERRORE nel turno:** ${(e as Error).message}`);
          }
          const newCalls: SpyCall[] = session.spy.calls.slice(cursor);
          cursor = session.spy.calls.length;
          const callBlocks = newCalls
            .map((c, k) =>
              [
                `#### Chiamata HTTP ${k + 1}`,
                `**Prompt inviato:**`,
                renderPrompt(c),
                `**Stream emesso:**`,
                renderStream(c),
                `**Tool-call classificate:**`,
                renderToolObservations(observeToolCalls(c)),
              ].join('\n\n'),
            )
            .join('\n\n');
          turnSection.push(callBlocks.length > 0 ? callBlocks : '_(nessuna chiamata al modello)_');
          sections.push(turnSection.join('\n\n'));
        }

        // Reflection sulla scena (write path: Event -> fatti L1.5 + riassunto L2).
        try {
          const r = await session.service.reflect('scena-1');
          sections.push(`## Reflection('scena-1')\nfactCount=${r.factCount}, summarized=${r.summarized}`);
        } catch (e) {
          sections.push(`## Reflection('scena-1')\n**ERRORE:** ${(e as Error).message}`);
        }

        // Snapshot finale della memoria (cosa vedrebbe il prossimo turno).
        const snap = snapshotMemory(session.memory, session.service.getReadModel().state);
        sections.push(`## Snapshot memoria dopo Reflection\n\n${renderSnapshot(snap)}`);

        // Follow-up noto (HANDOFF 7-quinquies): una seconda reflect sullo stesso range collide
        // sugli id deterministici (f-<from>-<to>-<i>) -> ci si aspetta un errore.
        let secondReflect: string;
        try {
          const r2 = await session.service.reflect('scena-1');
          secondReflect = `Nessun errore: factCount=${r2.factCount}, summarized=${r2.summarized}.`;
        } catch (e) {
          secondReflect = `Errore (atteso, collisione id deterministici): ${(e as Error).message}`;
        }
        sections.push(`## Seconda Reflection('scena-1') (follow-up noto)\n${secondReflect}`);

        // Trace completo del provider (request/response/validation-failure/retry/error).
        sections.push(`## Trace del provider\n${renderTracer(session.tracer)}`);
      } finally {
        session.close();
      }

      const report = sections.join('\n\n---\n\n') + '\n';
      const outPath = join(tmpdir(), 'loomn-spike-observations.md');
      writeFileSync(outPath, report, 'utf8');
      console.log(`\n[SPIKE] osservazioni scritte in: ${outPath}\n`);
    },
    600_000,
  );
});
