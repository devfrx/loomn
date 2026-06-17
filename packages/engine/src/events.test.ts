import { describe, it, expect } from 'vitest';
import type { Actor } from './actor';
import type { CheckResult } from './check';
import type { RollResult } from './dice';
import { createEncounter } from './encounter';
import { applyEvent, replay, initialState, type DomainEvent, type GameState } from './events';

function actor(id: string, hp = 10): Actor {
  return {
    id,
    name: id,
    kind: 'npc',
    attributes: {},
    skills: {},
    resources: { hp: { current: hp, max: 10 } },
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

describe('applyEvent', () => {
  it('ActorAdded registra l attore e incrementa la versione', () => {
    const s = applyEvent(initialState, { type: 'ActorAdded', actor: actor('eroe') });
    expect(s.actors['eroe']?.id).toBe('eroe');
    expect(s.version).toBe(1);
  });

  it('EncounterStarted imposta lo scontro', () => {
    const enc = createEncounter('e', [{ actorId: 'eroe', zone: 'a', initiative: 10 }]);
    const s = applyEvent(withActors(actor('eroe')), { type: 'EncounterStarted', encounter: enc });
    expect(s.encounter?.id).toBe('e');
  });

  it('TurnEnded avanza il turno', () => {
    const enc = createEncounter('e', [
      { actorId: 'a1', zone: 'a', initiative: 10 },
      { actorId: 'a2', zone: 'a', initiative: 5 },
    ]);
    let s = applyEvent(withActors(actor('a1'), actor('a2')), { type: 'EncounterStarted', encounter: enc });
    s = applyEvent(s, { type: 'TurnEnded' });
    expect(s.encounter?.turnIndex).toBe(1);
  });

  it('RoundAdvanced incrementa il round e riparte', () => {
    const enc = createEncounter('e', [{ actorId: 'a1', zone: 'a', initiative: 10 }]);
    let s = applyEvent(withActors(actor('a1')), { type: 'EncounterStarted', encounter: enc });
    s = applyEvent(s, { type: 'RoundAdvanced' });
    expect(s.encounter?.round).toBe(2);
    expect(s.encounter?.turnIndex).toBe(0);
  });

  it('DamageApplied riduce la risorsa del bersaglio', () => {
    const s = applyEvent(withActors(actor('goblin')), {
      type: 'DamageApplied',
      targetId: 'goblin',
      resource: 'hp',
      amount: 4,
    });
    expect(s.actors['goblin']?.resources['hp']?.current).toBe(6);
  });

  it('ActorDowned aggiunge morente una sola volta', () => {
    let s = withActors(actor('goblin'));
    s = applyEvent(s, { type: 'ActorDowned', actorId: 'goblin' });
    s = applyEvent(s, { type: 'ActorDowned', actorId: 'goblin' });
    const morente = s.actors['goblin']?.conditions.filter((c) => c.key === 'morente') ?? [];
    expect(morente).toHaveLength(1);
  });

  it('AttackResolved non cambia lo stato ma incrementa la versione', () => {
    const base = withActors(actor('eroe'), actor('goblin'));
    const check: CheckResult = {
      dice: [{ sides: 20, value: 15 }],
      modifierTotal: 0,
      total: 15,
      mode: 'check',
      dc: 10,
      margin: 5,
      outcome: 'success',
    };
    const s = applyEvent(base, { type: 'AttackResolved', attackerId: 'eroe', targetId: 'goblin', check, hit: true });
    expect(s.actors).toEqual(base.actors);
    expect(s.version).toBe(base.version + 1);
  });

  it('NarrationRecorded non cambia lo stato ma incrementa la versione', () => {
    const base = withActors(actor('eroe'));
    const s = applyEvent(base, {
      type: 'NarrationRecorded',
      playerAction: 'Osservo il goblin.',
      narration: 'Il goblin ti fissa, diffidente.',
    });
    expect(s.actors).toEqual(base.actors);
    expect(s.encounter).toEqual(base.encounter);
    expect(s.version).toBe(base.version + 1);
  });

  it('CheckResolved non cambia lo stato ma incrementa la versione', () => {
    const base = withActors(actor('eroe'));
    const result: CheckResult = {
      dice: [{ sides: 20, value: 18 }],
      modifierTotal: 3,
      total: 21,
      mode: 'check',
      dc: 15,
      margin: 6,
      outcome: 'success',
    };
    const s = applyEvent(base, { type: 'CheckResolved', actorId: 'eroe', attribute: 'forza', difficulty: 'moderate', result });
    expect(s.actors).toEqual(base.actors);
    expect(s.encounter).toEqual(base.encounter);
    expect(s.version).toBe(base.version + 1);
  });

  it('ResourceEffectApplied con delta positivo ripristina la risorsa clampando a max', () => {
    const base = withActors(actor('eroe', 4)); // hp 4/10
    const roll: RollResult = { dice: [{ sides: 6, value: 6 }], modifierTotal: 0, total: 6, mode: 'effect' };
    const s = applyEvent(base, { type: 'ResourceEffectApplied', targetId: 'eroe', resource: 'hp', delta: 8, roll });
    expect(s.actors['eroe']?.resources['hp']?.current).toBe(10); // 4 + 8 = 12 -> clamp a max 10
    expect(s.version).toBe(base.version + 1);
  });

  it('ResourceEffectApplied con delta negativo prosciuga la risorsa clampando a 0', () => {
    const base = withActors(actor('eroe', 3)); // hp 3/10
    const roll: RollResult = { dice: [{ sides: 6, value: 5 }], modifierTotal: 0, total: 5, mode: 'effect' };
    const s = applyEvent(base, { type: 'ResourceEffectApplied', targetId: 'eroe', resource: 'hp', delta: -5, roll });
    expect(s.actors['eroe']?.resources['hp']?.current).toBe(0); // 3 - 5 = -2 -> clamp a 0
    expect(s.version).toBe(base.version + 1);
  });

  it('ResourceEffectApplied lancia su attore sconosciuto', () => {
    const roll: RollResult = { dice: [{ sides: 6, value: 1 }], modifierTotal: 0, total: 1, mode: 'effect' };
    expect(() =>
      applyEvent(initialState, { type: 'ResourceEffectApplied', targetId: 'ignoto', resource: 'hp', delta: -1, roll }),
    ).toThrow('Attore sconosciuto: ignoto');
  });

  it('ResourceEffectApplied lancia su risorsa sconosciuta', () => {
    const base = withActors(actor('eroe'));
    const roll: RollResult = { dice: [{ sides: 6, value: 1 }], modifierTotal: 0, total: 1, mode: 'effect' };
    expect(() =>
      applyEvent(base, { type: 'ResourceEffectApplied', targetId: 'eroe', resource: 'mana', delta: 1, roll }),
    ).toThrow('Risorsa sconosciuta: mana');
  });

  it('QuestStarted aggiunge la quest attiva e incrementa la versione', () => {
    const s = applyEvent(initialState, {
      type: 'QuestStarted',
      quest: { id: 'q1', title: 'Trova l amuleto', status: 'active' },
    });
    expect(s.quests['q1']).toEqual({ id: 'q1', title: 'Trova l amuleto', status: 'active' });
    expect(s.actors).toEqual(initialState.actors);
    expect(s.encounter).toEqual(initialState.encounter);
    expect(s.version).toBe(1);
  });

  it('QuestAdvanced aggiorna lo stato della quest', () => {
    const started = applyEvent(initialState, {
      type: 'QuestStarted',
      quest: { id: 'q1', title: 'Trova l amuleto', status: 'active' },
    });
    const s = applyEvent(started, { type: 'QuestAdvanced', questId: 'q1', status: 'completed' });
    expect(s.quests['q1']?.status).toBe('completed');
    expect(s.quests['q1']?.title).toBe('Trova l amuleto');
    expect(s.version).toBe(2);
  });

  it('QuestAdvanced lancia su quest sconosciuta', () => {
    expect(() =>
      applyEvent(initialState, { type: 'QuestAdvanced', questId: 'ignota', status: 'completed' }),
    ).toThrow('Quest sconosciuta: ignota');
  });

  it('initialState ha quests vuoto', () => {
    expect(initialState.quests).toEqual({});
  });

  it('initialState parte in fase exploration', () => {
    expect(initialState.phase).toBe('exploration');
  });

  it('lancia per DamageApplied su attore sconosciuto', () => {
    expect(() =>
      applyEvent(initialState, { type: 'DamageApplied', targetId: 'ignoto', resource: 'hp', amount: 1 }),
    ).toThrow('Attore sconosciuto: ignoto');
  });

  it('lancia per TurnEnded senza scontro', () => {
    expect(() => applyEvent(initialState, { type: 'TurnEnded' })).toThrow('Nessuno scontro attivo');
  });

  it('lancia per RoundAdvanced senza scontro', () => {
    expect(() => applyEvent(initialState, { type: 'RoundAdvanced' })).toThrow('Nessuno scontro attivo');
  });
});

describe('replay', () => {
  it('ricostruisce lo stato applicando la sequenza di eventi', () => {
    const events: DomainEvent[] = [
      { type: 'ActorAdded', actor: actor('goblin') },
      { type: 'DamageApplied', targetId: 'goblin', resource: 'hp', amount: 10 },
      { type: 'ActorDowned', actorId: 'goblin' },
    ];
    const s = replay(events);
    expect(s.version).toBe(3);
    expect(s.actors['goblin']?.resources['hp']?.current).toBe(0);
    expect(s.actors['goblin']?.conditions.some((c) => c.key === 'morente')).toBe(true);
  });

  it('ricostruisce una quest fino allo stato terminale', () => {
    const events: DomainEvent[] = [
      { type: 'QuestStarted', quest: { id: 'q1', title: 'Salva il villaggio', status: 'active' } },
      { type: 'QuestAdvanced', questId: 'q1', status: 'failed' },
    ];
    const s = replay(events);
    expect(s.version).toBe(2);
    expect(s.quests['q1']?.status).toBe('failed');
  });
});
