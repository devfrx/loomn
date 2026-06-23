import type { CampaignSeed } from '@loomn/engine';
import { DEFAULT_CAMPAIGN_ID } from './campaign-path';

/** Seme di sviluppo concreto (come devRuleset): un mini-scenario per provare il flusso end-to-end
 *  senza AI/UX. PNG senza stat espliciti -> auto-fill risorse dal devRuleset (hp). */
export const devCampaignSeed: CampaignSeed = {
  frame: {
    id: DEFAULT_CAMPAIGN_ID,
    name: 'La Cripta di Vetro',
    premise: 'Un piccolo gruppo indaga sparizioni notturne in una citta portuale di vetrai.',
    setting: {
      place: 'Porto Vetraio',
      era: 'una eta del bronzo alternativa',
      genres: ['fantasy', 'mistero'],
      worldRules: 'Il vetro soffiato a Porto Vetraio puo trattenere le voci dei morti.',
    },
    tone: 'cupo ma avventuroso',
    openingScene: 'Notte. I moli sono deserti, una lanterna si spegne da sola e un rintocco viene da sottacqua.',
    hooks: ['Tre marinai scomparsi in tre notti', 'Una moneta di vetro che non dovrebbe esistere'],
  },
  keyNpcs: [
    { id: 'maestra-orsa', name: 'Maestra Orsa', description: 'Anziana vetraia, custodisce un segreto sul porto.' },
    { id: 'sgherro-loy', name: 'Loy lo Sgherro', description: 'Contrabbandiere nervoso, sa piu di quel che dice.' },
  ],
  keyPlaces: [
    { id: 'molo-vecchio', name: 'Il Molo Vecchio', description: 'Assi marce e reti, dove sono sparite le persone.' },
    { id: 'fornace', name: 'La Grande Fornace', description: 'Il cuore rovente della corporazione dei vetrai.' },
  ],
  initialFacts: [
    { subject: 'maestra-orsa', predicate: 'lavora-a', object: 'fornace' },
    { subject: 'sgherro-loy', predicate: 'frequenta', object: 'molo-vecchio' },
    { subject: 'porto-vetraio', predicate: 'minacciato-da', object: 'sparizioni notturne' },
  ],
};
