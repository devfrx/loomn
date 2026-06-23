import { join } from 'node:path';

/** Path del DB di UNA campagna: userData/campaigns/<id>/loomn.db. Isolamento by-file (fondamenta
 *  multi-campagna D-01a; il registro D-03 gestira piu id). */
export function campaignDbPath(userDataDir: string, campaignId: string): string {
  return join(userDataDir, 'campaigns', campaignId, 'loomn.db');
}

/** Id della campagna attiva di default finche non c e il registro (D-03). */
export const DEFAULT_CAMPAIGN_ID = 'default';
