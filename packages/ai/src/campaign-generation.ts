// Generazione AI-da-brief del Campaign Seed (D-01b): brief -> RawSeed (LLM) -> CampaignSeed.
// L AI resta vocabulary-agnostica; il codice deriva ids e riempie le stat dal Ruleset.

/** Slug deterministico per gli id: minuscolo, accenti rimossi, non-alfanumerici -> trattino. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
