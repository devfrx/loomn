import type { Clock } from '@loomn/memory';

/** Impl reale della porta Clock (Piano 8b). E l UNICO punto sanzionato in cui si legge il tempo
 *  di sistema: l engine e i pacchetti puri non usano mai Date.now (house rule), ma host e un
 *  adapter di composizione, quindi qui e corretto. Nei test si inietta un clock fisso. */
export const systemClock: Clock = {
  now: () => Date.now(),
};
