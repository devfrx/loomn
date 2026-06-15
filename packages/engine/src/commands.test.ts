import { describe, it, expect } from 'vitest';
import type { Actor } from './actor';
import type { RandomSource } from './random';
import { decide } from './commands';
import { applyEvent, initialState, type GameState } from './events';

function actor(id: string): Actor {
  return {
    id,
    name: id,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: 10, max: 10 } },
    conditions: [],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

function withActors(...as: Actor[]): GameState {
  let s = initialState;
  for (const a of as) {
    s = applyEvent(s, { type: 'ActorAdded', actor: a });
  }
  return s;
}

const rng: RandomSource = { next: () => 0.5 };

describe('decide AddActor', () => {
  it('emette ActorAdded', () => {
    const events = decide(initialState, { type: 'AddActor', actor: actor('eroe') }, rng);
    expect(events).toEqual([{ type: 'ActorAdded', actor: actor('eroe') }]);
  });
  it('lancia se l attore è già presente', () => {
    const s = withActors(actor('eroe'));
    expect(() => decide(s, { type: 'AddActor', actor: actor('eroe') }, rng)).toThrow('già presente');
  });
});

describe('decide StartEncounter', () => {
  it('emette EncounterStarted con i partecipanti ordinati per iniziativa', () => {
    const s = withActors(actor('eroe'), actor('goblin'));
    const events = decide(
      s,
      {
        type: 'StartEncounter',
        encounterId: 'e',
        participants: [
          { actorId: 'goblin', zone: 'a', initiative: 5 },
          { actorId: 'eroe', zone: 'a', initiative: 10 },
        ],
      },
      rng,
    );
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.type).toBe('EncounterStarted');
    if (ev.type === 'EncounterStarted') {
      expect(ev.encounter.participants.map((p) => p.actorId)).toEqual(['eroe', 'goblin']);
    }
  });
  it('lancia se un partecipante non esiste', () => {
    const s = withActors(actor('eroe'));
    expect(() =>
      decide(s, { type: 'StartEncounter', encounterId: 'e', participants: [{ actorId: 'ignoto', zone: 'a', initiative: 5 }] }, rng),
    ).toThrow('Attore sconosciuto');
  });
});

describe('decide EndTurn e NextRound', () => {
  function withEncounter(): GameState {
    let s = withActors(actor('eroe'));
    s = applyEvent(s, {
      type: 'EncounterStarted',
      encounter: { id: 'e', participants: [{ actorId: 'eroe', zone: 'a', initiative: 10, actedThisRound: false }], round: 1, turnIndex: 0 },
    });
    return s;
  }
  it('EndTurn emette TurnEnded quando c è uno scontro', () => {
    expect(decide(withEncounter(), { type: 'EndTurn' }, rng)).toEqual([{ type: 'TurnEnded' }]);
  });
  it('EndTurn lancia senza scontro', () => {
    expect(() => decide(initialState, { type: 'EndTurn' }, rng)).toThrow('Nessuno scontro attivo');
  });
  it('NextRound emette RoundAdvanced', () => {
    expect(decide(withEncounter(), { type: 'NextRound' }, rng)).toEqual([{ type: 'RoundAdvanced' }]);
  });
});
