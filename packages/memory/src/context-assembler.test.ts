import { describe, it, expect } from 'vitest';
import {
  createContextAssembler,
  defaultEstimateTokens,
  recencyWeight,
} from './context-assembler';
import { openDatabase } from './db';
import { createCanonLedger } from './canon-ledger';
import { createSummaryStore, type Summary } from './summary-store';
import type { Clock } from './clock';
import type { GameState } from '@loomn/engine';

const HOUR = 3_600_000;

function fixedClock(now: number): Clock {
  return { now: () => now };
}

const HERO_STATE: GameState = {
  version: 1,
  encounter: null,
  quests: {},
  phase: 'exploration',
  actors: {
    pc1: { id: 'pc1', name: 'Eroe', kind: 'pc', attributes: {}, skills: {}, resources: { hp: { current: 10, max: 12 } }, conditions: [], items: [], progression: { xp: 0, level: 0 } },
    g1: { id: 'g1', name: 'Goblin', kind: 'npc', attributes: {}, skills: {}, resources: { hp: { current: 8, max: 8 } }, conditions: [], items: [], progression: { xp: 0, level: 0 } },
  },
};

function summary(over: Partial<Summary> & Pick<Summary, 'id' | 'text' | 'salience' | 'createdAt'>): Summary {
  return { level: 'scene', scope: 'sess1', importance: 5, eventSeqFrom: 0, eventSeqTo: 0, ...over };
}

describe('recencyWeight (decadimento a tempo di lettura)', () => {
  it('eta 0 -> peso 1', () => {
    expect(recencyWeight(1000, 1000, 0.995)).toBe(1);
  });
  it('createdAt nel futuro -> trattato come eta 0 -> peso 1', () => {
    expect(recencyWeight(1000, 5000, 0.995)).toBe(1);
  });
  it('decade monotonicamente col passare del tempo', () => {
    const young = recencyWeight(10 * HOUR, 9 * HOUR, 0.995);
    const old = recencyWeight(10 * HOUR, 1 * HOUR, 0.995);
    expect(young).toBeGreaterThan(old);
    expect(young).toBeLessThan(1);
  });
  it('1 ora con decay 0.995 -> circa 0.995', () => {
    expect(recencyWeight(2 * HOUR, 1 * HOUR, 0.995)).toBeCloseTo(0.995, 6);
  });
});

describe('defaultEstimateTokens (euristica char/4)', () => {
  it('arrotonda per eccesso', () => {
    expect(defaultEstimateTokens('')).toBe(0);
    expect(defaultEstimateTokens('abc')).toBe(1);
    expect(defaultEstimateTokens('abcd')).toBe(1);
    expect(defaultEstimateTokens('abcde')).toBe(2);
  });
});

describe('createContextAssembler (read path combinato, sqlite reale)', () => {
  it('assembla L1 + L1.5 (solo soggetti in scena) + L2', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      ledger.record({ id: 'f1', subject: 'Eroe', predicate: 'ha_ucciso', object: 'Guardia#3', eventSeq: 10, salience: 0.8 });
      ledger.record({ id: 'f2', subject: 'Re', predicate: 'ha_promesso', object: 'ricompensa', eventSeq: 11, salience: 0.9 });
      summaries.record(summary({ id: 's1', text: 'Il gruppo entra nella cripta.', salience: 0.7, createdAt: 5 * HOUR }));

      const ctx = createContextAssembler({ ledger, summaries, clock: fixedClock(5 * HOUR) }, { tokenBudget: 1000 })(HERO_STATE);

      expect(ctx).toContain('Stato attuale (L1)');
      expect(ctx).toContain('Eroe (pc, id=pc1): risorse: hp 10/12');
      expect(ctx).toContain('Fatti canonici (L1.5)');
      expect(ctx).toContain('Eroe ha_ucciso Guardia#3');
      expect(ctx).not.toContain('Re ha_promesso');
      expect(ctx).toContain('Memoria recente (L2)');
      expect(ctx).toContain('Il gruppo entra nella cripta.');
    } finally {
      close();
    }
  });

  it('budget: con estimate fisso entra solo il piu saliente; L1/L1.5 mai tagliati', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      ledger.record({ id: 'f1', subject: 'Eroe', predicate: 'porta', object: 'la spada', eventSeq: 1, salience: 0.5 });
      summaries.record(summary({ id: 's-hi', text: 'alta salienza', salience: 0.9, createdAt: 1000 }));
      summaries.record(summary({ id: 's-mid', text: 'media salienza', salience: 0.5, createdAt: 1000 }));
      summaries.record(summary({ id: 's-lo', text: 'bassa salienza', salience: 0.1, createdAt: 1000 }));
      const ctx = createContextAssembler(
        { ledger, summaries, clock: fixedClock(1000) },
        { tokenBudget: 3, estimateTokens: () => 1 },
      )(HERO_STATE);
      expect(ctx).toContain('Stato attuale (L1)');
      expect(ctx).toContain('Eroe porta la spada');
      expect(ctx).toContain('alta salienza');
      expect(ctx).not.toContain('media salienza');
      expect(ctx).not.toContain('bassa salienza');
    } finally {
      close();
    }
  });

  it('budget 0: L2 vuota, L1 e L1.5 restano', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      ledger.record({ id: 'f1', subject: 'Goblin', predicate: 'impugna', object: 'una clava', eventSeq: 1, salience: 0.4 });
      summaries.record(summary({ id: 's1', text: 'qualcosa di recente', salience: 0.9, createdAt: 1000 }));
      const ctx = createContextAssembler({ ledger, summaries, clock: fixedClock(1000) }, { tokenBudget: 0 })(HERO_STATE);
      expect(ctx).toContain('Stato attuale (L1)');
      expect(ctx).toContain('Goblin impugna una clava');
      expect(ctx).not.toContain('Memoria recente (L2)');
    } finally {
      close();
    }
  });

  it('recency rompe la parita di salienza: il piu recente vince', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      summaries.record(summary({ id: 's-old', text: 'evento vecchio', salience: 0.6, createdAt: 1 * HOUR }));
      summaries.record(summary({ id: 's-new', text: 'evento recente', salience: 0.6, createdAt: 9 * HOUR }));
      const ctx = createContextAssembler(
        { ledger, summaries, clock: fixedClock(10 * HOUR) },
        { tokenBudget: 2, estimateTokens: () => 1 },
      )(HERO_STATE);
      expect(ctx).toContain('evento recente');
      expect(ctx).not.toContain('evento vecchio');
    } finally {
      close();
    }
  });

  it('e deterministico: stessi input -> stessa stringa', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      ledger.record({ id: 'f1', subject: 'Eroe', predicate: 'e', object: 'stanco', eventSeq: 1, salience: 0.3 });
      summaries.record(summary({ id: 's1', text: 'A', salience: 0.5, createdAt: 100 }));
      summaries.record(summary({ id: 's2', text: 'B', salience: 0.5, createdAt: 100 }));
      const make = () => createContextAssembler({ ledger, summaries, clock: fixedClock(200) }, { tokenBudget: 1000 })(HERO_STATE);
      expect(make()).toBe(make());
    } finally {
      close();
    }
  });

  it('L1 espone attributi e abilita per-attore', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      const state: GameState = {
        version: 1,
        encounter: null,
        quests: {},
        phase: 'exploration',
        actors: {
          hero: {
            id: 'hero',
            name: 'Guerriero',
            kind: 'pc',
            attributes: { forza: 3 },
            skills: { arcano: 2 },
            resources: { hp: { current: 20, max: 20 } },
            conditions: [],
            items: [],
            progression: { xp: 0, level: 0 },
          },
        },
      };
      const out = createContextAssembler({ ledger, summaries, clock: fixedClock(0) }, { tokenBudget: 1000 })(state);
      expect(out).toContain('forza 3');
      expect(out).toContain('arcano 2');
      expect(out).toContain('hp 20/20');
    } finally {
      close();
    }
  });
});

describe('compatibilita col punto di iniezione di ai', () => {
  // Replica LOCALE del tipo `AssembleContext` di `ai` (memory NON importa ai): prova che
  // l assembler reale e assegnabile al punto di iniezione di runMasterTurn.
  type AssembleContext = (state: GameState) => string;

  it('l assembler e assegnabile a (state) => string e produce il contesto', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      const injected: AssembleContext = createContextAssembler({ ledger, summaries, clock: fixedClock(0) }, { tokenBudget: 500 });
      expect(injected(HERO_STATE)).toContain('Stato attuale (L1)');
    } finally {
      close();
    }
  });
});

describe('blocco quest in L1', () => {
  function withQuests(quests: GameState['quests']): GameState {
    return { ...HERO_STATE, quests };
  }
  function assemble(state: GameState): string {
    const { db, close } = openDatabase(':memory:');
    try {
      const ledger = createCanonLedger(db);
      const summaries = createSummaryStore(db);
      return createContextAssembler({ ledger, summaries, clock: fixedClock(0) }, { tokenBudget: 1000 })(state);
    } finally {
      close();
    }
  }

  it('rende le quest attive ordinate per id, con e senza description', () => {
    const ctx = assemble(
      withQuests({
        qb: { id: 'qb', title: 'Salva il villaggio', status: 'active' },
        qa: { id: 'qa', title: 'Trova l amuleto', description: 'Per il Barone', status: 'active' },
      }),
    );
    expect(ctx).toContain('Quest attive (L1)');
    expect(ctx).toContain('- Trova l amuleto (id=qa): Per il Barone');
    expect(ctx).toContain('- Salva il villaggio (id=qb)');
    // ordinate per id: qa prima di qb
    expect(ctx.indexOf('id=qa')).toBeLessThan(ctx.indexOf('id=qb'));
  });

  it('rende solo le quest attive in uno stato misto attive+terminate', () => {
    const ctx = assemble(
      withQuests({
        qa: { id: 'qa', title: 'In corso', status: 'active' },
        qz: { id: 'qz', title: 'Conclusa', status: 'completed' },
      }),
    );
    expect(ctx).toContain('Quest attive (L1)');
    expect(ctx).toContain('In corso');
    expect(ctx).not.toContain('Conclusa');
  });

  it('non rende un blocco quest se non ci sono quest attive (solo terminate)', () => {
    const ctx = assemble(
      withQuests({
        q1: { id: 'q1', title: 'Completata', status: 'completed' },
        q2: { id: 'q2', title: 'Fallita', status: 'failed' },
      }),
    );
    expect(ctx).not.toContain('Quest attive (L1)');
    expect(ctx).not.toContain('Completata');
  });

  it('non rende un blocco quest quando quests e vuoto (stato esistente invariato)', () => {
    expect(assemble(HERO_STATE)).not.toContain('Quest attive (L1)');
  });

  it('il blocco quest fa parte di L1: non viene tagliato con budget 0', () => {
    const questState = withQuests({ q1: { id: 'q1', title: 'Urgente', status: 'active' } });
    expect(assemble(questState)).toContain('Urgente');

    const { db, close } = openDatabase(':memory:');
    try {
      const assembler0 = createContextAssembler(
        { ledger: createCanonLedger(db), summaries: createSummaryStore(db), clock: fixedClock(0) },
        { tokenBudget: 0 },
      );
      const ctx0 = assembler0(questState);
      expect(ctx0).toContain('Quest attive (L1)');
      expect(ctx0).toContain('Urgente');
    } finally {
      close();
    }
  });
});
