import { useDiceStore } from '../stores/dice';
import { extractRolls } from '../lib/turn-events';
import type { DispatchCommand, DispatchResult } from '@loomn/shared';

/** Dispatch di un Command + accoda al pannello dadi i tiri prodotti (Attack/RequestCheck/ApplyEffect).
 *  Cosi i comandi manuali della Regia (GM) mostrano i dadi 3D senza un turno AI. */
export function useDispatch(): { dispatch: (command: DispatchCommand) => Promise<DispatchResult> } {
  const dice = useDiceStore();

  async function dispatch(command: DispatchCommand): Promise<DispatchResult> {
    const res = await window.loomn.dispatch(command);
    if (res.ok) dice.enqueue(extractRolls(res.events));
    return res;
  }

  return { dispatch };
}
