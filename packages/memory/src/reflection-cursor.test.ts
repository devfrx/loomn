import { describe, it, expect, afterEach } from 'vitest';
import { openDatabase, type OpenDb } from './db';
import { createReflectionCursor } from './reflection-cursor';

let open: OpenDb | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

describe('createReflectionCursor', () => {
  it('get di default ritorna 0 (riga seminata dalla migrazione)', () => {
    open = openDatabase(':memory:');
    const cursor = createReflectionCursor(open.db);
    expect(cursor.get()).toBe(0);
  });

  it('set poi get ritorna il seq impostato', () => {
    open = openDatabase(':memory:');
    const cursor = createReflectionCursor(open.db);
    cursor.set(7);
    expect(cursor.get()).toBe(7);
  });

  it('set ripetuto avanza il watermark (idempotente sulla riga singleton)', () => {
    open = openDatabase(':memory:');
    const cursor = createReflectionCursor(open.db);
    cursor.set(3);
    cursor.set(9);
    expect(cursor.get()).toBe(9);
  });
});
