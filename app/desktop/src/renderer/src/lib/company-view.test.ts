import { describe, it, expect } from 'vitest';
import { toCompanyCard, canonForActor } from './company-view';
import type { ActorView } from '../stores/read-model';
import type { CanonFactDto } from '@loomn/shared';

function actor(over: Partial<ActorView> & { id: string }): ActorView {
  return {
    id: over.id,
    name: over.name ?? over.id,
    kind: over.kind ?? 'pc',
    attributes: over.attributes ?? {},
    skills: over.skills ?? {},
    resources: over.resources ?? {},
    conditions: over.conditions ?? [],
    items: over.items ?? [],
    progression: over.progression ?? { xp: 0, level: 1 },
  };
}

function fact(over: Partial<CanonFactDto> & { id: string }): CanonFactDto {
  return {
    id: over.id,
    subject: over.subject ?? 'Eroe',
    predicate: over.predicate ?? 'conosce',
    object: over.object ?? 'Goblin',
    eventSeq: over.eventSeq ?? 1,
    salience: over.salience ?? 0.5,
    status: over.status ?? 'active',
  };
}

describe('toCompanyCard', () => {
  it('riporta identita, livello, risorse e conteggi', () => {
    const card = toCompanyCard(
      actor({
        id: 'eroe',
        name: 'Eroe',
        kind: 'pc',
        resources: { hp: { current: 7, max: 10 } },
        conditions: [{ key: 'benedetto', source: 'rito', effects: [], duration: { kind: 'permanent' } }],
        items: [{ id: 'spada', name: 'Spada', equipped: true, effects: [] }],
        progression: { xp: 50, level: 2 },
      }),
    );
    expect(card.name).toBe('Eroe');
    expect(card.kind).toBe('pc');
    expect(card.level).toBe(2);
    expect(card.resources).toEqual([{ key: 'hp', current: 7, max: 10 }]);
    expect(card.conditionCount).toBe(1);
    expect(card.itemCount).toBe(1);
  });
});

describe('canonForActor', () => {
  const facts = [
    fact({ id: 'f1', subject: 'Eroe', predicate: 'odia', object: 'Strega' }),
    fact({ id: 'f2', subject: 'Mercante', predicate: 'teme', object: 'eroe' }),
    fact({ id: 'f3', subject: 'Goblin', predicate: 'serve', object: 'Re' }),
  ];

  it('trova i fatti per nome senza badare al maiuscolo', () => {
    const out = canonForActor(facts, actor({ id: 'x', name: 'Eroe' }));
    expect(out.map((f) => f.id).sort()).toEqual(['f1', 'f2']);
  });

  it('trova i fatti per id quando il subject o l object e l id', () => {
    const a = actor({ id: 'pg-eroe', name: 'Altro Nome' });
    const bySubject = fact({ id: 'r1', subject: 'pg-eroe', predicate: 'guida', object: 'gruppo' });
    const byObject = fact({ id: 'r2', subject: 'Mastino', predicate: 'segue', object: 'pg-eroe' });
    expect(canonForActor([bySubject, byObject], a).map((f) => f.id).sort()).toEqual(['r1', 'r2']);
  });

  it('ritorna vuoto senza match', () => {
    expect(canonForActor(facts, actor({ id: 'z', name: 'Sconosciuto' }))).toEqual([]);
  });
});
