#!/usr/bin/env node
// F7 / M-11 + D-06: automazione del gate Electron a 2 fasi (l unica copertura dell integrazione reale
// IPC/DB/safeStorage). Riproduce la sequenza manuale documentata (HANDOFF §6/§9) come SINGLE-SOURCE,
// invocando gli script gia esistenti invece di re-implementarli:
//   kill-ghost -> build -> [try: rebuild:electron -> 2 lanci self-test (LOOMN_SELFTEST 1 e 2 sullo
//   STESSO userData temp)] -> finally: rebuild:node (ripristina SEMPRE l ABI Node per `pnpm test`).
// Il flip ABI -> Electron sta DENTRO il try: cosi rebuild:node nel finally ripristina l ABI anche se
// rebuild:electron fallisce a meta (flip parziale) o un lancio lancia. Esce 0 SOLO se entrambe le fasi
// loggano `VERDICT: PASS` (il main Electron esce 0/1 sul VERDICT; spawnSync ne cattura lo status).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
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

// Risolve il binario electron del workspace app/desktop e lo lancia DIRETTAMENTE (niente shell, niente
// `pnpm exec`): in questo ambiente la risoluzione del *bin* via `pnpm --filter @loomn/desktop exec electron`
// si rompe SUBITO DOPO `rebuild:electron` (ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL "electron not found"),
// mentre il bin diretto funziona. require('electron') restituisce il path assoluto dell eseguibile
// (es. electron.exe su Windows); spawnSync senza shell evita ogni problema di quoting/risoluzione del bin.
const electronBin = createRequire(join(process.cwd(), 'app', 'desktop', 'package.json'))('electron');

/** Lancia il self-test Electron sul build (arg = la app dir app/desktop), bin diretto, stdio ereditato. */
function runSelfTest(label, extraEnv) {
  console.log(`\n[gate] ${label}: ${electronBin} app/desktop`);
  const r = spawnSync(electronBin, ['app/desktop'], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  return r.status ?? 1;
}

// 1) Libera il lock su better_sqlite3.node da eventuali ghost PRIMA del rebuild (causa #1 di fallimenti).
killGhosts();

// 2) Build di produzione (out/main + out/renderer): il gate lancia `electron .` sul build, non sul dev.
//    Sta PRIMA del flip ABI e del temp: se fallisce, l ABI e ancora Node e non c e nulla da ripulire.
if (sh('build', 'pnpm --filter @loomn/desktop build') !== 0) {
  console.log('\n[gate] RISULTATO: FAIL (build fallita)');
  process.exit(1);
}

// 3) Temp userData PRIMA del flip ABI: mkdtemp non tocca l ABI, quindi un suo throw lascia l ABI su Node.
const userData = mkdtempSync(join(tmpdir(), 'loomn-gate-'));
let phase1 = 1;
let phase2 = 1;
try {
  // 4) Flip ABI -> Electron DENTRO il try: il finally ripristina SEMPRE l ABI Node, anche su flip parziale.
  if (sh('rebuild:electron', 'pnpm rebuild:electron') !== 0) {
    console.log('\n[gate] rebuild:electron fallito — un ghost tiene il lock? `pnpm gate:kill-ghost`');
  } else {
    // 5) Due lanci sequenziali sullo STESSO userData temp: fase 1 costruisce lo stato, fase 2 verifica
    //    la persistenza dopo il riavvio + il reload in-finestra (I-02). Il main esce 0/1 sul VERDICT.
    phase1 = runSelfTest('self-test fase 1', {
      LOOMN_SELFTEST: '1',
      LOOMN_USERDATA: userData,
    });
    phase2 = runSelfTest('self-test fase 2', {
      LOOMN_SELFTEST: '2',
      LOOMN_USERDATA: userData,
    });
  }
} finally {
  // 6) Ripristina SEMPRE l ABI Node (altrimenti `pnpm test` fallisce con NODE_MODULE_VERSION 146/137).
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
