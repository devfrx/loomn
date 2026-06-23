import { describe, it, expect } from 'vitest';
import { applyEvent, replay, initialState, type DomainEvent, type CampaignFrame } from './index';

const frame: CampaignFrame = {
  id: 'c1',
  name: 'La Cripta di Vetro',
  premise: 'Un party indaga sparizioni in una citta sul mare.',
  setting: { place: 'Porto Vetraio', era: 'eta del bronzo alternativa', genres: ['fantasy', 'mistero'] },
  tone: 'cupo ma avventuroso',
  openingScene: 'Notte, moli deserti, una lanterna si spegne.',
  hooks: ['Tre marinai scomparsi', 'Una moneta che non dovrebbe esistere'],
};

describe('CampaignFramed', () => {
  it('applyEvent setta campaignFrame e incrementa la versione', () => {
    const e: DomainEvent = { type: 'CampaignFramed', frame };
    const s = applyEvent(initialState, e);
    expect(s.campaignFrame?.name).toBe('La Cripta di Vetro');
    expect(s.version).toBe(initialState.version + 1);
  });

  it('replay ricostruisce campaignFrame deterministicamente', () => {
    const events: DomainEvent[] = [{ type: 'CampaignFramed', frame }];
    const s = replay(events);
    expect(s.campaignFrame?.premise).toContain('sparizioni');
  });

  it('initialState non ha campaignFrame', () => {
    expect(initialState.campaignFrame).toBeUndefined();
  });
});
