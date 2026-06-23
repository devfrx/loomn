#!/usr/bin/env node
// F7 / M-11 + D-06: rileva e termina le sessioni Electron FANTASMA di Loomn (un `electron-vite dev` o
// `electron .` rimasto appeso da una sessione precedente) che tengono il lock su `better_sqlite3.node`
// e fanno fallire `rebuild:electron`/`rebuild:node` con EBUSY/EPERM (causa #1 di gate falliti).
//
// Sicurezza del targeting (decisione consapevole, vedi piano F7):
//   - Matcha SOLO `electron.exe` (il binario di node_modules usato da dev/app/gate). NON matcha `node`
//     (a differenza del pattern documentato `electron|node`): il processo del gate E `pnpm` SONO node →
//     matchare `node` si auto-ucciderebbe. E i lock-holder dell ABI Electron sono SEMPRE electron.exe
//     (e il processo che ha caricato il .node sotto Electron), mai un node nudo.
//   - Filtra per command line contenente il path del progetto (`tabl`/`loomn`) → scoping al solo Loomn.
//   - Esclude comunque il PID corrente per sicurezza.
//   - `electron.exe` (node_modules) NON e `Code.exe`/`Claude.exe`/`slack.exe` → VS Code/Claude/Slack
//     restano intatti anche se hanno la cartella `tabl` aperta.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Termina gli Electron fantasma di Loomn. No-op fuori da Windows. Best-effort: non lancia mai. */
export function killGhosts() {
  if (process.platform !== 'win32') {
    console.log('[kill-ghost] non-Windows: nessun ghost da gestire, skip.');
    return;
  }
  const ps = [
    `$me = ${process.pid}`,
    `Get-CimInstance Win32_Process |`,
    `  Where-Object { $_.ProcessId -ne $me -and $_.Name -match 'electron' -and $_.CommandLine -match 'tabl|loomn' } |`,
    `  ForEach-Object {`,
    `    Write-Output ('[kill-ghost] termino {0} (pid {1})' -f $_.Name, $_.ProcessId)`,
    `    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }`,
    `    catch { Write-Output ('[kill-ghost] impossibile terminare pid {0}: {1}' -f $_.ProcessId, $_.Exception.Message) }`,
    `  }`,
  ].join('\n');
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit' });
  if (r.error !== undefined) {
    console.log(`[kill-ghost] PowerShell non avviabile (${r.error.message}): continuo comunque.`);
  }
  console.log('[kill-ghost] completato.');
}

// Esecuzione diretta (`pnpm gate:kill-ghost`): pathToFileURL gestisce i path Windows (backslash/drive).
// La guardia su argv[1] evita ERR_INVALID_ARG_TYPE se il modulo e caricato senno (es. node -e/REPL).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  killGhosts();
}
