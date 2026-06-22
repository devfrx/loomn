import { useDiceStore } from '../stores/dice';
import { extractRolls } from '../lib/turn-events';
import type { DispatchCommand, DispatchResult } from '@loomn/shared';

/** Dispatch di un Command + accoda al pannello dadi i tiri prodotti (Attack/RequestCheck/ApplyEffect).
 *  Cosi i comandi manuali della Regia (GM) mostrano i dadi 3D senza un turno AI.
 *  Robustezza (allineata a use-run-turn): il readout dadi riflette SEMPRE il comando corrente
 *  (clear prima dell enqueue, M-07) e un reject IPC (handler che lancia / clone serialization fallita)
 *  diventa un esito {ok:false,error} invece di un unhandled rejection (I-09): i caller
 *  (GmConsole/EncounterPanel) leggono gia res.ok/res.error e mostrano il feedback senza modifiche. */
export function useDispatch(): { dispatch: (command: DispatchCommand) => Promise<DispatchResult> } {
  const dice = useDiceStore();

  async function dispatch(command: DispatchCommand): Promise<DispatchResult> {
    // Il readout dadi riflette il comando CORRENTE: svuota i tiri precedenti (un comando senza tiri,
    // es. EnterPhase/EndTurn, non lascia un readout stantio). enqueue li ripopola se ci sono tiri.
    dice.clear();
    try {
      const res = await window.loomn.dispatch(command);
      if (res.ok) dice.enqueue(extractRolls(res.events));
      return res;
    } catch (err) {
      // Mai fallire in silenzio: un reject diventa un esito tipizzato che il caller mostra.
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { dispatch };
}
