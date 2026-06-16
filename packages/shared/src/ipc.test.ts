import { describe, it, expect } from 'vitest';
import {
  IPC_CHANNELS,
  pingRequestSchema,
  pingResponseSchema,
  readModelPushSchema,
} from './ipc';

describe('contratto IPC: nomi dei canali', () => {
  it('espone nomi di canale stabili e univoci', () => {
    const names = Object.values(IPC_CHANNELS);
    expect(new Set(names).size).toBe(names.length);
    expect(IPC_CHANNELS.ping).toBe('loomn:ping');
    expect(IPC_CHANNELS.readModelPush).toBe('loomn:read-model-push');
  });
});

describe('contratto IPC: schemi dei payload', () => {
  it('pingRequestSchema accetta un payload valido', () => {
    const parsed = pingRequestSchema.parse({ text: 'ciao' });
    expect(parsed.text).toBe('ciao');
  });

  it('pingRequestSchema rifiuta un payload senza text', () => {
    expect(pingRequestSchema.safeParse({}).success).toBe(false);
  });

  it('pingResponseSchema accetta una risposta valida', () => {
    const parsed = pingResponseSchema.parse({ ok: true, echo: 'ciao', upper: 'CIAO' });
    expect(parsed.ok).toBe(true);
  });

  it('readModelPushSchema accetta una proiezione read-side', () => {
    const parsed = readModelPushSchema.parse({ version: 0, summary: 'nessuno stato' });
    expect(parsed.version).toBe(0);
  });

  it('readModelPushSchema rifiuta una version negativa', () => {
    expect(readModelPushSchema.safeParse({ version: -1, summary: 'x' }).success).toBe(false);
  });
});
