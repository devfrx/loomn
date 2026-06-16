import { describe, it, expect } from 'vitest';
import { openDatabase } from './db';
import { events, snapshots, canonFacts, summaries } from './schema';

describe('openDatabase', () => {
  it('crea la tabella events utilizzabile dopo la migrazione', () => {
    const { db, close } = openDatabase(':memory:');
    db.insert(events).values({ type: 'TurnEnded', payload: '{}' }).run();
    expect(db.select().from(events).all()).toEqual([{ seq: 1, type: 'TurnEnded', payload: '{}' }]);
    close();
  });

  it('crea la tabella snapshots utilizzabile dopo la migrazione', () => {
    const { db, close } = openDatabase(':memory:');
    db.insert(snapshots).values({ version: 5, state: '{}' }).run();
    expect(db.select().from(snapshots).all()).toEqual([{ version: 5, state: '{}' }]);
    close();
  });

  it('crea la tabella canon_facts utilizzabile dopo la migrazione 0001', () => {
    const { db, close } = openDatabase(':memory:');
    db.insert(canonFacts)
      .values({ id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1, status: 'active' })
      .run();
    expect(db.select().from(canonFacts).all()).toEqual([
      { id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1, status: 'active', salience: 0 },
    ]);
    close();
  });

  it('aggiunge la colonna salience a canon_facts con la migrazione 0003 (default 0)', () => {
    const { db, close } = openDatabase(':memory:');
    db.insert(canonFacts).values({ id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1, status: 'active' }).run();
    expect(db.select().from(canonFacts).all()).toEqual([
      { id: 'f1', subject: 's', predicate: 'p', object: 'o', eventSeq: 1, status: 'active', salience: 0 },
    ]);
    close();
  });

  it('crea la tabella summaries utilizzabile dopo la migrazione 0002', () => {
    const { db, close } = openDatabase(':memory:');
    db.insert(summaries)
      .values({ id: 's1', level: 'scene', scope: 'sess1', text: 'la taverna brucia', importance: 7, salience: 0.7, createdAt: 1000, eventSeqFrom: 1, eventSeqTo: 4 })
      .run();
    expect(db.select().from(summaries).all()).toEqual([
      { id: 's1', level: 'scene', scope: 'sess1', text: 'la taverna brucia', importance: 7, salience: 0.7, createdAt: 1000, eventSeqFrom: 1, eventSeqTo: 4 },
    ]);
    close();
  });
});
