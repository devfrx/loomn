import { useNarrationStore } from '../stores/narration';
import { useDiceStore } from '../stores/dice';
import { extractRolls } from '../lib/turn-events';

/** Orchestratore del turno: invia l azione, instrada narrazione e tiri ai rispettivi store. */
export function useRunTurn(): { submit: (action: string) => Promise<void> } {
  const narration = useNarrationStore();
  const dice = useDiceStore();

  // Doppia invocazione impossibile in pratica: il caller (NarrativePanel) disabilita l input su
  // narration.pending. Nessuna guardia runtime per YAGNI; il contratto vive nel caller.
  async function submit(action: string): Promise<void> {
    const trimmed = action.trim();
    if (trimmed === '') return;
    narration.setError(null);
    // Il readout dadi riflette il turno CORRENTE: svuota i tiri precedenti (un turno senza tiri,
    // es. solo narrazione, non lascia un readout stantio). enqueue li ripopola se ci sono tiri.
    dice.clear();
    narration.setPending(true);
    try {
      const res = await window.loomn.runTurn({ playerAction: trimmed });
      if (!res.ok) {
        narration.setError(res.error);
        return;
      }
      narration.appendTurn(trimmed, res.narration);
      dice.enqueue(extractRolls(res.events));
    } catch (err) {
      narration.setError(err instanceof Error ? err.message : String(err));
    } finally {
      narration.setPending(false);
    }
  }

  return { submit };
}
