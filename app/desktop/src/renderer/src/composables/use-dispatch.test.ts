import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDispatch } from './use-dispatch';
import { useDiceStore } from '../stores/dice';

describe('useDispatch', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('accoda al pannello dadi i tiri dagli events di un dispatch ok', async () => {
    window.loomn = {
      dispatch: vi.fn(() =>
        Promise.resolve({
          ok: true,
          version: 3,
          events: [
            {
              type: 'CheckResolved',
              actorId: 'eroe',
              difficulty: 'moderate',
              result: { dice: [{ sides: 20, value: 14 }], modifierTotal: 0, total: 14, mode: 'check', dc: 10, margin: 4, outcome: 'success' },
            },
          ],
        }),
      ),
    } as unknown as typeof window.loomn;
    const dice = useDiceStore();
    const { dispatch } = useDispatch();
    const res = await dispatch({ type: 'RequestCheck', actorId: 'eroe', difficulty: 'moderate' });
    expect(res.ok).toBe(true);
    expect(dice.rolls[0]?.notation).toBe('1d20@14');
    expect(dice.nonce).toBe(1);
  });

  it('un dispatch senza tiri non tocca la coda dadi', async () => {
    window.loomn = {
      dispatch: vi.fn(() => Promise.resolve({ ok: true, version: 1, events: [{ type: 'PhaseChanged', from: 'exploration', to: 'dialogue' }] })),
    } as unknown as typeof window.loomn;
    const dice = useDiceStore();
    const { dispatch } = useDispatch();
    await dispatch({ type: 'EnterPhase', to: 'dialogue' });
    expect(dice.rolls).toEqual([]);
    expect(dice.nonce).toBe(0);
  });

  it('su esito di errore non accoda', async () => {
    window.loomn = { dispatch: vi.fn(() => Promise.resolve({ ok: false, error: 'no' })) } as unknown as typeof window.loomn;
    const dice = useDiceStore();
    const { dispatch } = useDispatch();
    const res = await dispatch({ type: 'EndEncounter' });
    expect(res.ok).toBe(false);
    expect(dice.nonce).toBe(0);
  });
});
