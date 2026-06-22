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

  it('azzera il readout dadi prima di un comando senza tiri (no readout stantio)', async () => {
    const dice = useDiceStore();
    const { dispatch } = useDispatch();
    // 1) un comando che produce un tiro popola la coda dadi
    window.loomn = {
      dispatch: vi.fn(() =>
        Promise.resolve({
          ok: true,
          version: 1,
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
    await dispatch({ type: 'RequestCheck', actorId: 'eroe', difficulty: 'moderate' });
    expect(dice.rolls.length).toBe(1);
    // 2) un comando SENZA tiri deve azzerare il readout, non lasciare quello stantio
    window.loomn = {
      dispatch: vi.fn(() => Promise.resolve({ ok: true, version: 2, events: [{ type: 'PhaseChanged', from: 'exploration', to: 'dialogue' }] })),
    } as unknown as typeof window.loomn;
    await dispatch({ type: 'EnterPhase', to: 'dialogue' });
    expect(dice.rolls).toEqual([]);
  });

  it('un reject della invoke IPC diventa un esito ok:false error (mai unhandled)', async () => {
    window.loomn = {
      dispatch: vi.fn(() => Promise.reject(new Error('An object could not be cloned'))),
    } as unknown as typeof window.loomn;
    const { dispatch } = useDispatch();
    const res = await dispatch({ type: 'EndTurn' });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('could not be cloned');
  });
});
