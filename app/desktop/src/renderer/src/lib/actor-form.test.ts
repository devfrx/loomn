import { describe, it, expect } from 'vitest';
import { buildActorId, buildActor } from './actor-form';

describe('buildActorId (slug unico contro gli id esistenti)', () => {
  it('slugifica il nome', () => {
    expect(buildActorId('Kaelen il Rosso', [])).toBe('kaelen-il-rosso');
  });

  it('disambigua con suffisso numerico al collidere', () => {
    expect(buildActorId('Goblin', ['goblin'])).toBe('goblin-2');
    expect(buildActorId('Goblin', ['goblin', 'goblin-2'])).toBe('goblin-3');
  });

  it('ripiega su attore per un nome senza caratteri validi', () => {
    expect(buildActorId('!!!', [])).toBe('attore');
  });
});

describe('buildActor (Actor completo per AddActor)', () => {
  it('costruisce un Actor con id generato, conditions/items vuoti, progressione di base', () => {
    const a = buildActor(
      {
        name: 'Kaelen',
        kind: 'pc',
        attributes: { forza: 12 },
        skills: { atletica: 2 },
        resources: { hp: { current: 10, max: 10 } },
      },
      [],
    );
    expect(a.id).toBe('kaelen');
    expect(a.name).toBe('Kaelen');
    expect(a.kind).toBe('pc');
    expect(a.attributes).toEqual({ forza: 12 });
    expect(a.resources).toEqual({ hp: { current: 10, max: 10 } });
    expect(a.conditions).toEqual([]);
    expect(a.items).toEqual([]);
    expect(a.progression).toEqual({ xp: 0, level: 1 });
  });
});
