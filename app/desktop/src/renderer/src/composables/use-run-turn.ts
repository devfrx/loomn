import { useNarrationStore } from '../stores/narration';
import { useDiceStore } from '../stores/dice';
import { extractRolls } from '../lib/turn-events';

/** Orchestratore del turno: invia l azione, instrada narrazione e tiri ai rispettivi store. */
export function useRunTurn(): { submit: (action: string) => Promise<void> } {
  const narration = useNarrationStore();
  const dice = useDiceStore();

  async function submit(action: string): Promise<void> {
    const trimmed = action.trim();
    if (trimmed === '') return;
    narration.setError(null);
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
