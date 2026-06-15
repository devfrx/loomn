import { describe, it, expect } from 'vitest';
import type { RandomSource } from './random';
import type { Actor } from './actor';
import { buildCheckExpr, actorCheck, type CheckRequest } from './actor-check';

function stubRandom(values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

function hero(): Actor {
  return {
    id: 'pg-1',
    name: 'Kael',
    kind: 'pc',
    attributes: { forza: 3 },
    skills: { atletica: 2 },
    resources: { hp: { current: 10, max: 10 } },
    conditions: [
      { key: 'inspired', source: 'bardo', effects: [{ kind: 'checkModifier', value: 1 }], duration: { kind: 'permanent' } },
    ],
    items: [],
    progression: { xp: 0, level: 1 },
  };
}

describe('buildCheckExpr', () => {
  it('usa 1d20 di default e somma attributo, abilità e condizioni come modificatori', () => {
    const req: CheckRequest = { actor: hero(), attribute: 'forza', skill: 'atletica', dc: 10 };
    const expr = buildCheckExpr(req);
    expect(expr.dice).toEqual([{ count: 1, sides: 20 }]);
    expect(expr.mode).toBe('check');
    // 3 (forza) + 2 (atletica) + 1 (inspired)
    const total = expr.modifiers.reduce((s, m) => s + m.value, 0);
    expect(total).toBe(6);
  });

  it('include i modificatori situazionali e i dadi base personalizzati', () => {
    const req: CheckRequest = {
      actor: hero(),
      attribute: 'forza',
      baseDice: [{ count: 2, sides: 6 }],
      situationalModifiers: [{ value: -2, source: 'buio' }],
      dc: 8,
    };
    const expr = buildCheckExpr(req);
    expect(expr.dice).toEqual([{ count: 2, sides: 6 }]);
    // 3 (forza) + 1 (inspired globale) + (-2) situazionale
    const total = expr.modifiers.reduce((s, m) => s + m.value, 0);
    expect(total).toBe(2);
  });
});

describe('actorCheck', () => {
  it('risolve la prova in modo deterministico col motore di tiro', () => {
    const rng = stubRandom([0.95]); // 1d20 → faccia 20
    const req: CheckRequest = { actor: hero(), attribute: 'forza', skill: 'atletica', dc: 10 };
    const res = actorCheck(req, rng);
    expect(res.total).toBe(26); // 20 + 6
    expect(res.dc).toBe(10);
    expect(res.margin).toBe(16);
    expect(res.outcome).toBe('critical');
  });
});
