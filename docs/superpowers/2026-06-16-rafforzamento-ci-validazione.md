# Loomn — Tre tracce di rafforzamento (da affrontare in sessioni separate)

> **Data:** 2026-06-16 · **Contesto:** scritto a fine Piano 9 (Electron completo, 266 test, HEAD su `main`). Sono tre interventi **trasversali** (non feature di prodotto) emersi da una revisione del metodo. Ognuna e un *brief di avvio sessione* autosufficiente: apri una nuova sessione, fai leggere all'agente **`docs/superpowers/HANDOFF.md`** + la traccia qui sotto, e procedi col flusso solito (§4 dell'HANDOFF).
>
> **Priorita consigliata:** Traccia A (gate scriptabile) e Traccia B (slice giocabile) per prime — danno il ritorno piu alto. La Traccia C e una rifinitura di processo, 10 minuti.
>
> **Perche esistono (sintesi della revisione):** il progetto e fortissimo su correttezza/manutenibilita, ma due rischi non sono ancora coperti — (1) **regressione**: l'integrazione Electron del 9c-ii non ha rete automatica (solo un self-test lanciato a mano); (2) **prodotto**: il design memoria+AI (L1/L1.5/L2, Reflection, Context Assembler) non e ancora mai stato messo alla prova con un LLM vero in gioco reale. Le tracce A e B coprono esattamente questi due.

---

## Traccia A — Rete di sicurezza: gate self-test scriptabile + CI

**Obiettivo:** rendere automatica e ripetibile la verifica che oggi faccio a mano (il gate "esegui l'app" del 9c-ii), e mettere una rete `pnpm test` + `typecheck` su ogni push.

**Perche:** i 266 test sono unit puri su ABI Node; **tutta** l'integrazione Electron (DB reale, IPC, safeStorage) e coperta solo da un self-test manuale a due lanci. Una modifica futura puo rompere il wiring IPC in silenzio. Inoltre i merge sono fast-forward locali, senza CI: le uniche review sono di subagent (cioe lo stesso modello che rivede se stesso).

**Cosa fare — passo 1 (piccolo, alto valore): script `gate:selftest`.**
Automatizza la procedura del gate del 9c-ii (oggi manuale, documentata in HANDOFF §7-quinquies) in un singolo comando. Deve, in sequenza:
1. `pnpm --filter @loomn/desktop build` (ABI Node, nativa esternalizzata).
2. `pnpm rebuild:electron` (better-sqlite3 → ABI Electron 146).
3. lanciare l'app con `LOOMN_USERDATA` = dir temp pulita e `LOOMN_SELFTEST=1`, catturare exit code (atteso 0) e la riga `VERDICT: PASS fase=1`.
4. ri-lanciare con `LOOMN_SELFTEST=2` sullo stesso `LOOMN_USERDATA` (atteso `VERDICT: PASS fase=2`).
5. **sempre** (anche su fallimento): `pnpm -r rebuild better-sqlite3` per ripristinare l'ABI Node, poi pulire la dir temp.
6. uscire non-zero se una delle due fasi non e PASS.
- Implementalo come piccolo script Node (`scripts/gate-selftest.mjs`) invocato da uno script npm `gate:selftest` in `package.json` (root) — **passo orchestratore**, non subagent (tocca i manifesti).
- **Attenzione ABI (HANDOFF §7-quinquies):** `rebuild:node` DEVE restare `pnpm -r rebuild better-sqlite3` (la forma root no-oppa). Fallback se mai no-oppasse: `prebuild-install` nella dir store `node_modules/.pnpm/better-sqlite3@<ver>/node_modules/better-sqlite3`.
- Lo script e la cosa piu utile e indipendente: de-rischia subito il gate manuale.

**Cosa fare — passo 2 (decisione + CI):**
- **Decisione da prendere con l'utente:** aggiungere un **remote** (es. GitHub privato) — consigliato per un prodotto serio — oppure restare local-only con un **git hook** (`pre-push`) che gira la verifica. Senza remote non esiste CI vera; con remote si sblocca GitHub Actions e le PR.
- Se remote + GitHub Actions: due **job separati** (il conflitto ABI Node↔Electron impedisce di condividere la nativa in un solo job):
  - *job unit* (qualsiasi OS): `pnpm install` → `pnpm -r typecheck` → `pnpm test` (266, ABI Node).
  - *job gate Electron*: `pnpm install` → `pnpm gate:selftest`. Su runner Linux serve `xvfb-run` (Electron headless); su runner Windows no. Il runner e effimero → non serve ripristinare l'ABI a fine job.
- Se local-only: uno script aggregato `pnpm verify` (= `typecheck` + `test`) + un hook `pre-push` (es. `simple-git-hooks`) che lo lancia. Il gate Electron resta on-demand (`pnpm gate:selftest`) perche flippa l'ABI.

**Scope / non-goal:** niente nuove feature; niente test E2E pesanti (Playwright-for-Electron e Fase 2+). Obiettivo minimo: il gate diventa un comando + (se si sceglie il remote) gira in CI.

**Skill:** flusso §4 standard. Lo script `gate-selftest.mjs` e codice → puo passare da subagent (TDD leggero: il "test" e che il VERDICT compaia), ma il setup npm/CI/hook e passo orchestratore.

**Riferimenti:** HANDOFF §7-quinquies (lezioni del gate, ABI), §5 (house rules), `app/desktop/src/renderer/src/renderer.ts` (logica self-test), `app/desktop/src/main/index.ts` (cattura `VERDICT` + `app.exit`).

---

## Traccia B — Slice giocabile: validare memoria+AI contro un LLM vero

**Obiettivo:** giocare *davvero* qualche turno con un LLM reale (LM Studio locale) e **osservare** se gli strati di memoria si comportano come il design assume. Output principale = un documento di **findings**, non codice di produzione.

**Perche:** sono stati costruiti Canon Ledger L1.5, salienza, Context Assembler con budget di token, Reflection — macchinari raffinati — senza che una sola sessione vera li abbia stressati. Meglio scoprire ora (mentre le astrazioni sono economiche da cambiare) se reggono. E gia tutto wired: l'app del 9c-ii espone `set-provider` / `run-turn` / `reflect` via IPC; manca solo guidarli con un modello vero.

**Prerequisiti:** LM Studio in ascolto su `http://localhost:1234/v1` con un modello caricato (un 7-8B instruct va bene per lo spike).

**Cosa fare — opzione minima (spike, niente UI):**
- Estendi il diagnostico del renderer (o aggiungi un piccolo script driver) per: `setProvider({ baseUrl, model })` reale → eseguire **N `runTurn`** con azioni-giocatore scritte a mano che coprano: spawn di un PNG, un check/attacco, un fatto narrativo da promuovere a canone → poi un `reflect('scena-1')`.
- Dopo i turni, **dump e ispezione**: gli `Event` reali prodotti, la `narration`, il contesto assemblato (`memory.assembleContext`), e il contenuto di Canon Ledger (`ledger.active()`) + Summary Store (`summaries.list()`).
- **Cosa osservare (le domande che validano il design):**
  - Il Master propone `Command` *sensati e validi* (non rifiutati da `decide`)? Quante tool-call invalide?
  - La Reflection estrae fatti canonici *ragionevoli* (giusto `subject/predicate/object`, `functional` corretto)?
  - Il Context Assembler include i fatti L1.5 *giusti* per la scena e resta nel budget di token?
  - Dove rompe? (es. il follow-up noto: una seconda `reflect` sullo stesso range collide sugli id deterministici — vedi HANDOFF §7-quinquies.)
- Scrivi i findings in `docs/superpowers/findings-slice-llm.md`: cosa regge, cosa no, quali astrazioni vanno riviste **prima** di costruirci sopra.

**Relazione col Piano 10:** questo spike *e* di fatto il primo passo della fase di studio del Piano 10 (UI). Puo restare throwaway o evolvere. NON e ancora `writing-plans`: e esplorazione guidata (skill `superpowers:brainstorming` per inquadrare le domande; eventuale `frontend-design` solo se decidi di abbozzare una UI minima per giocare).

**Scope / non-goal:** niente UI completa, niente dadi 3D, niente persistenza nuova. E uno spike di *validazione*, non un piano. Se serve un minimo di UI per giocare comodamente, che sia volutamente grezza.

**Riferimenti:** spec §5.4 (pipeline AI Master), §6.1/§6.2 (Reflection / Context Assembler), HANDOFF §7-ter/§7-quater (API `@loomn/host`: `createCampaignService.runTurn/reflect`, `createLanguageProvider`), §7-quinquies (l'app espone gia i canali).

---

## Traccia C — Rifinitura di processo: proporzionare il rito di review

**Obiettivo:** codificare quando **saltare** la code-quality review, per non spendere un rito a 3 subagent su task banali.

**Perche:** per i task senza logica algoritmica (solo schemi Zod / solo tipi / scaffold) la review di qualita aggiunge poco. Lo si fa gia informalmente (nel 9c-ii ho saltato la qualita sul Task 1 "solo schemi" e l'ho dichiarato); va solo reso esplicito come regola, cosi il prossimo agente non esita.

**Cosa fare (10 minuti):** aggiungi una riga alle house rules dell'HANDOFF (§5) / al processo (§4): *"Code-quality review obbligatoria per task con logica; per task solo-schema/solo-tipi/scaffold la salti e lo dichiari. Spec-review sempre."* Eventualmente una nota gemella nel template di `subagent-driven-development` se vuoi che valga oltre Loomn.

**Scope / non-goal:** non toccare il rigore dove serve (spec-review resta sempre; qualita resta sempre sui rami con logica). E solo evitare overhead sui task triviali.

**Skill:** nessuna esecuzione di codice — modifica doc (`HANDOFF.md`), commit `docs: ...` con la riga Co-Authored-By.

---

## Nota di sintesi (per chi riprende)
Il *come* costruisci non va cambiato — e la parte difficile, ed e inchiodata. Queste tre tracce spostano la copertura sui due rischi rimasti scoperti: **regressione** (A) e **prodotto** (B), piu una rifinitura (C). Se ne fai una sola, fai la **B**: puo invalidare assunzioni del design memoria/AI mentre sono ancora economiche da cambiare.
