#!/usr/bin/env node
// F7 / M-11 + D-06: automazione del gate Electron a 2 fasi (l unica copertura dell integrazione reale
// IPC/DB/safeStorage). Riproduce la sequenza manuale documentata (HANDOFF §6/§9) come SINGLE-SOURCE,
// invocando gli script gia esistenti invece di re-implementarli:
//   kill-ghost -> build -> rebuild:electron -> 2 lanci self-test (LOOMN_SELFTEST 1 e 2 sullo STESSO
//   userData temp) -> rebuild:node (SEMPRE, in finally: ripristina l ABI Node per `pnpm test`).
// Esce 0 SOLO se entrambe le fasi loggano `VERDICT: PASS` (il main Electron esce 0/1 sul VERDICT;
// spawnSync ne cattura lo status). Il temp userData isola il gate dal DB di sviluppo.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { killGhosts } from './kill-ghost.mjs';

/** Esegue un comando via shell (cross-platform per le pnpm script), stdio ereditato. Ritorna l exit code. */
function sh(label, cmd, extraEnv) {
  console.log(`\n[gate] ${label}: ${cmd}`);
  const r = spawnSync(cmd, {
    stdio: 'inherit',
    shell: true,
    env: extraEnv === undefined ? process.env : { ...process.env, ...extraEnv },
  });
  return r.status ?? 1;
}

// 1) Libera il lock su better_sqlite3.node da eventuali ghost PRIMA del rebuild (causa #1 di fallimenti).
killGhosts();

// 2) Build di produzione (out/main + out/renderer): il gate lancia `electron .` sul build, non sul dev.
if (sh('build', 'pnpm --filter @loomn/desktop build') !== 0) {
  console.log('\n[gate] RISULTATO: FAIL (build fallita)');
  process.exit(1);
}

// 3) Flip ABI -> Electron (better-sqlite3 ricompilato per l ABI di Electron).
if (sh('rebuild:electron', 'pnpm rebuild:electron') !== 0) {
  console.log('\n[gate] RISULTATO: FAIL (rebuild:electron fallito — un ghost tiene il lock? `pnpm gate:kill-ghost`)');
  process.exit(1);
}

const userData = mkdtempSync(join(tmpdir(), 'loomn-gate-'));
let phase1 = 1;
let phase2 = 1;
try {
  // 4) Due lanci sequenziali sullo STESSO userData temp: fase 1 costruisce lo stato, fase 2 verifica la
  //    persistenza dopo il riavvio + il reload in-finestra (I-02). Il main esce 0/1 sul VERDICT loggato.
  phase1 = sh('self-test fase 1', 'pnpm --filter @loomn/desktop exec electron .', {
    LOOMN_SELFTEST: '1',
    LOOMN_USERDATA: userData,
  });
  phase2 = sh('self-test fase 2', 'pnpm --filter @loomn/desktop exec electron .', {
    LOOMN_SELFTEST: '2',
    LOOMN_USERDATA: userData,
  });
} finally {
  // 5) Ripristina SEMPRE l ABI Node (altrimenti `pnpm test` fallisce con NODE_MODULE_VERSION 146/137).
  if (sh('rebuild:node', 'pnpm rebuild:node') !== 0) {
    console.log('\n[gate] ATTENZIONE: rebuild:node FALLITO. L ABI nativa e rimasta su Electron — esegui `pnpm rebuild:node` a mano prima di `pnpm test`.');
  }
  try {
    rmSync(userData, { recursive: true, force: true });
  } catch {
    // best-effort: un temp userData residuo non e fatale.
  }
}

const ok = phase1 === 0 && phase2 === 0;
console.log(`\n[gate] RISULTATO: ${ok ? 'PASS' : 'FAIL'} (fase1=${phase1 === 0 ? 'PASS' : 'FAIL'}, fase2=${phase2 === 0 ? 'PASS' : 'FAIL'})`);
process.exit(ok ? 0 : 1);
