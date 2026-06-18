import { describe, it, expect } from 'vitest';
import { reactive, isReactive } from 'vue';
import { buildActorId, buildActor, type ActorFormState } from './actor-form';

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

  // Bug "An object could not be cloned": il form e reactive (proxy Vue); passare i proxy annidati al
  // dispatch IPC fa fallire la structured clone di Electron. buildActor deve restituire strutture PLAIN.
  it('restituisce strutture annidate PLAIN (non reattive) clonabili da IPC anche da un form reactive', () => {
    const form = reactive<ActorFormState>({
      name: 'Eroe',
      kind: 'pc',
      attributes: { forza: 2 },
      skills: { atletica: 1 },
      resources: { hp: { current: 10, max: 10 } },
    });
    const a = buildActor(form, []);
    expect(isReactive(a.attributes)).toBe(false);
    expect(isReactive(a.skills)).toBe(false);
    expect(isReactive(a.resources)).toBe(false);
    expect(isReactive(a.resources['hp'])).toBe(false);
    expect(a.attributes).toEqual({ forza: 2 });
    expect(a.resources).toEqual({ hp: { current: 10, max: 10 } });
    expect(() => structuredClone(a)).not.toThrow();
  });
});
