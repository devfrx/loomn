import { describe, it, expect } from 'vitest';
import { buildProviderPayload } from './provider-form';

describe('buildProviderPayload (tri-stato chiave per set-provider)', () => {
  it('keep OMETTE apiKey (il main mantiene la chiave esistente)', () => {
    const p = buildProviderPayload({ baseUrl: ' http://x/v1 ', model: ' m ', keyAction: 'keep', keyInput: '' });
    expect(p).toEqual({ baseUrl: 'http://x/v1', model: 'm' });
    expect('apiKey' in p).toBe(false);
  });

  it('set passa la chiave digitata', () => {
    const p = buildProviderPayload({ baseUrl: 'http://x/v1', model: 'm', keyAction: 'set', keyInput: 'sk-123' });
    expect(p).toEqual({ baseUrl: 'http://x/v1', model: 'm', apiKey: 'sk-123' });
  });

  it('remove invia apiKey vuota (il main cancella)', () => {
    const p = buildProviderPayload({ baseUrl: 'http://x/v1', model: 'm', keyAction: 'remove', keyInput: 'ignorata' });
    expect(p).toEqual({ baseUrl: 'http://x/v1', model: 'm', apiKey: '' });
  });
});
