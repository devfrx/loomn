import { describe, it, expect } from 'vitest';
import { toEncounterView, DOWNED_CONDITION_KEY } from './encounter-view';
import type { EncounterView, ActorView } from '../stores/read-model';

function actor(over: Partial<ActorView> & { id: string }): ActorView {
  return {
    id: over.id,
    name: over.name ?? over.id,
    kind: over.kind ?? 'npc',
    attributes: over.attributes ?? {},
    skills: over.skills ?? {},
    resources: over.resources ?? {},
    conditions: over.conditions ?? [],
    items: over.items ?? [],
    progression: over.progression ?? { xp: 0, level: 1 },
  };
}

function encounter(over: Partial<NonNullable<EncounterView>> = {}): NonNullable<EncounterView> {
  return {
    id: over.id ?? 'enc1',
    participants: over.participants ?? [],
    round: over.round ?? 1,
    turnIndex: over.turnIndex ?? 0,
  };
}

describe('toEncounterView', () => {
  it('preserva l ordine di iniziativa del motore e marca il turno corrente', () => {
    const enc = encounter({
      turnIndex: 1,
      participants: [
        { actorId: 'a', zone: 'centro', initiative: 20, actedThisRound: true },
        { actorId: 'b', zone: 'centro', initiative: 10, actedThisRound: false },
      ],
    });
    const view = toEncounterView(enc, [actor({ id: 'a', name: 'Alfa' }), actor({ id: 'b', name: 'Beta' })]);
    expect(view.order.map((r) => r.actorId)).toEqual(['a', 'b']);
    expect(view.order[0]!.isCurrent).toBe(false);
    expect(view.order[1]!.isCurrent).toBe(true);
    expect(view.current?.actorId).toBe('b');
  });

  it('riporta round e turnIndex dal read-model', () => {
    const view = toEncounterView(
      encounter({ round: 3, turnIndex: 0, participants: [{ actorId: 'a', zone: 'centro', initiative: 5, actedThisRound: false }] }),
      [actor({ id: 'a' })],
    );
    expect(view.round).toBe(3);
    expect(view.turnIndex).toBe(0);
  });

  it('arricchisce la riga con nome e risorse dell attore', () => {
    const enc = encounter({ participants: [{ actorId: 'hero', zone: 'centro', initiative: 12, actedThisRound: false }] });
    const view = toEncounterView(enc, [actor({ id: 'hero', name: 'Eroe', resources: { hp: { current: 7, max: 10 } } })]);
    expect(view.order[0]!.name).toBe('Eroe');
    expect(view.order[0]!.resources).toEqual([{ key: 'hp', current: 7, max: 10 }]);
  });

  it('per un attore sconosciuto usa l id come nome e risorse vuote', () => {
    const enc = encounter({ participants: [{ actorId: 'ghost', zone: 'centro', initiative: 1, actedThisRound: false }] });
    const view = toEncounterView(enc, []);
    expect(view.order[0]!.name).toBe('ghost');
    expect(view.order[0]!.resources).toEqual([]);
    expect(view.order[0]!.isDowned).toBe(false);
  });

  it('marca a terra chi ha la condizione morente', () => {
    const downed = actor({
      id: 'x',
      conditions: [{ key: DOWNED_CONDITION_KEY, source: 'combat', effects: [], duration: { kind: 'permanent' } }],
    });
    const enc = encounter({ participants: [{ actorId: 'x', zone: 'centro', initiative: 8, actedThisRound: false }] });
    expect(toEncounterView(enc, [downed]).order[0]!.isDowned).toBe(true);
  });

  it('raggruppa per zona in ordine di prima apparizione', () => {
    const enc = encounter({
      participants: [
        { actorId: 'a', zone: 'fronte', initiative: 20, actedThisRound: false },
        { actorId: 'b', zone: 'retro', initiative: 15, actedThisRound: false },
        { actorId: 'c', zone: 'fronte', initiative: 10, actedThisRound: false },
      ],
    });
    const view = toEncounterView(enc, [actor({ id: 'a' }), actor({ id: 'b' }), actor({ id: 'c' })]);
    expect(view.zones.map((z) => z.zone)).toEqual(['fronte', 'retro']);
    expect(view.zones[0]!.participants.map((r) => r.actorId)).toEqual(['a', 'c']);
    expect(view.zones[1]!.participants.map((r) => r.actorId)).toEqual(['b']);
  });

  it('con turnIndex oltre la fine del round current e null', () => {
    const enc = encounter({
      turnIndex: 2,
      participants: [
        { actorId: 'a', zone: 'centro', initiative: 5, actedThisRound: true },
        { actorId: 'b', zone: 'centro', initiative: 3, actedThisRound: true },
      ],
    });
    expect(toEncounterView(enc, [actor({ id: 'a' }), actor({ id: 'b' })]).current).toBeNull();
  });
});
