import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useRunTurn } from './use-run-turn';
import { useNarrationStore } from '../stores/narration';
import { useDiceStore } from '../stores/dice';

describe('useRunTurn', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('su turno ok appende la narrazione e accoda i tiri dagli events', async () => {
    window.loomn = {
      runTurn: vi.fn(() =>
        Promise.resolve({
          ok: true,
          narration: 'Il colpo va a segno.',
          version: 5,
          events: [
            {
              type: 'AttackResolved', attackerId: 'eroe', targetId: 'goblin', hit: true,
              check: { dice: [{ sides: 20, value: 18 }], modifierTotal: 2, total: 20, mode: 'check', dc: 12, margin: 8, outcome: 'success' },
            },
          ],
        }),
      ),
    } as unknown as typeof window.loomn;
    const narration = useNarrationStore();
    const dice = useDiceStore();
    const { submit } = useRunTurn();

    await submit('attacco il goblin');

    expect(window.loomn.runTurn as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({ playerAction: 'attacco il goblin' });
    expect(narration.entries.at(-1)?.narration).toBe('Il colpo va a segno.');
    expect(dice.rolls[0]?.notation).toBe('1d20@18');
    expect(dice.nonce).toBe(1);
    expect(narration.pending).toBe(false);
    expect(narration.error).toBeNull();
  });

  it('su turno in errore popola error e non appende', async () => {
    window.loomn = { runTurn: vi.fn(() => Promise.resolve({ ok: false, error: 'provider non configurato' })) } as unknown as typeof window.loomn;
    const narration = useNarrationStore();
    const dice = useDiceStore();
    const { submit } = useRunTurn();
    await submit('faccio qualcosa');
    expect(narration.error).toBe('provider non configurato');
    expect(narration.entries).toEqual([]);
    expect(dice.rolls).toEqual([]);
    expect(narration.pending).toBe(false);
  });

  it('su runTurn che rigetta imposta error e svuota pending', async () => {
    window.loomn = { runTurn: vi.fn(() => Promise.reject(new Error('IPC error'))) } as unknown as typeof window.loomn;
    const narration = useNarrationStore();
    const { submit } = useRunTurn();
    await submit('faccio qualcosa');
    expect(narration.error).toBe('IPC error');
    expect(narration.entries).toEqual([]);
    expect(narration.pending).toBe(false);
  });

  it('ignora un azione vuota o di soli spazi', async () => {
    window.loomn = { runTurn: vi.fn() } as unknown as typeof window.loomn;
    const { submit } = useRunTurn();
    await submit('   ');
    expect(window.loomn.runTurn).not.toHaveBeenCalled();
  });
});
