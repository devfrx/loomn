import { describe, it, expect } from 'vitest';
import { createEncounter, rangeBetween, type ParticipantInput } from './encounter';
import type { ZoneMap } from './zone';

const map: ZoneMap = { a: ['b'], b: ['a', 'c'], c: ['b'] };

const inputs: ParticipantInput[] = [
  { actorId: 'goblin', zone: 'c', initiative: 8 },
  { actorId: 'eroe', zone: 'a', initiative: 15 },
  { actorId: 'alleato', zone: 'a', initiative: 12 },
];

describe('createEncounter', () => {
  it('ordina i partecipanti per iniziativa e inizializza round e turno', () => {
    const enc = createEncounter('enc-1', inputs);
    expect(enc.participants.map((p) => p.actorId)).toEqual(['eroe', 'alleato', 'goblin']);
    expect(enc.round).toBe(1);
    expect(enc.turnIndex).toBe(0);
    expect(enc.participants.every((p) => p.actedThisRound === false)).toBe(true);
  });
});

describe('rangeBetween', () => {
  it('ritorna la banda di gittata tra due partecipanti', () => {
    const enc = createEncounter('enc-1', inputs);
    expect(rangeBetween(enc, map, 'eroe', 'alleato')).toBe('engaged'); // stessa zona 'a'
    expect(rangeBetween(enc, map, 'eroe', 'goblin')).toBe('far'); // a -> c = 2
  });
  it('lancia per un partecipante sconosciuto', () => {
    const enc = createEncounter('enc-1', inputs);
    expect(() => rangeBetween(enc, map, 'eroe', 'ignoto')).toThrow(
      'Partecipante sconosciuto nello scontro',
    );
  });
});
