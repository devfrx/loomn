import { describe, it, expect } from 'vitest';
import {
  createEncounter,
  rangeBetween,
  currentParticipant,
  endTurn,
  roundComplete,
  nextRound,
  moveParticipant,
  type ParticipantInput,
} from './encounter';
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

describe('currentParticipant', () => {
  it('ritorna il partecipante del turno corrente', () => {
    const enc = createEncounter('e', inputs);
    expect(currentParticipant(enc).actorId).toBe('eroe');
  });
});

describe('endTurn', () => {
  it('marca chi ha agito e avanza il turno', () => {
    const enc = endTurn(createEncounter('e', inputs));
    expect(enc.turnIndex).toBe(1);
    expect(enc.participants[0]!.actedThisRound).toBe(true);
    expect(enc.participants[1]!.actedThisRound).toBe(false);
  });
});

describe('roundComplete', () => {
  it('è vero quando tutti hanno agito', () => {
    let enc = createEncounter('e', inputs);
    expect(roundComplete(enc)).toBe(false);
    enc = endTurn(endTurn(endTurn(enc)));
    expect(roundComplete(enc)).toBe(true);
  });
});

describe('nextRound', () => {
  it('azzera gli stati, incrementa il round e riparte dal primo', () => {
    let enc = endTurn(endTurn(endTurn(createEncounter('e', inputs))));
    enc = nextRound(enc);
    expect(enc.round).toBe(2);
    expect(enc.turnIndex).toBe(0);
    expect(enc.participants.every((p) => p.actedThisRound === false)).toBe(true);
  });
});

describe('moveParticipant', () => {
  it('muove in una zona adiacente', () => {
    const enc = moveParticipant(createEncounter('e', inputs), map, 'eroe', 'b');
    expect(enc.participants.find((p) => p.actorId === 'eroe')?.zone).toBe('b');
  });
  it('lancia se la zona non è adiacente', () => {
    expect(() => moveParticipant(createEncounter('e', inputs), map, 'eroe', 'c')).toThrow(
      'Mossa non valida',
    );
  });
});
