import { describe, it, expect, vi } from 'vitest';
import { resolveStoredKey } from './provider-config';

describe('resolveStoredKey (tri-stato della chiave provider)', () => {
  const encrypt = (plain: string): string => `ENC(${plain})`;

  it('apiKey undefined mantiene il ciphertext esistente', () => {
    expect(resolveStoredKey(undefined, 'PRIOR', encrypt)).toBe('PRIOR');
  });

  it('apiKey undefined senza ciphertext precedente resta senza chiave', () => {
    expect(resolveStoredKey(undefined, undefined, encrypt)).toBeUndefined();
  });

  it('apiKey stringa vuota rimuove la chiave esistente', () => {
    expect(resolveStoredKey('', 'PRIOR', encrypt)).toBeUndefined();
  });

  it('apiKey non vuota sostituisce cifrando', () => {
    expect(resolveStoredKey('sk-new', 'PRIOR', encrypt)).toBe('ENC(sk-new)');
  });

  it('non cifra quando la chiave va mantenuta o rimossa', () => {
    const spy = vi.fn((plain: string) => `ENC(${plain})`);
    resolveStoredKey(undefined, 'PRIOR', spy);
    resolveStoredKey('', 'PRIOR', spy);
    expect(spy).not.toHaveBeenCalled();
  });
});
