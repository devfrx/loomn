import { describe, it, expect } from 'vitest';
import { campaignDbPath, DEFAULT_CAMPAIGN_ID } from './campaign-path';

describe('campaignDbPath', () => {
  it('compone userData/campaigns/<id>/loomn.db', () => {
    const p = campaignDbPath('/u', 'c1');
    expect(p.replace(/\\/g, '/')).toBe('/u/campaigns/c1/loomn.db');
  });
  it('DEFAULT_CAMPAIGN_ID e default', () => {
    expect(DEFAULT_CAMPAIGN_ID).toBe('default');
  });
});
