// Difficolta qualitativa di una prova. L AI propone la band; il CODICE possiede la CD
// (il codice e l arbitro). Tabella di default dell engine: un modulo (Piano 11) potra'
// sostituirla via Ruleset iniettato (spec 5.3) senza toccare i call site. Tenuta come
// funzione pura, isolata, proprio per essere migrabile in un Ruleset in un secondo momento.

export const DIFFICULTIES = ['trivial', 'easy', 'moderate', 'hard', 'formidable', 'legendary'] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

const DC_BY_DIFFICULTY: Record<Difficulty, number> = {
  trivial: 5,
  easy: 10,
  moderate: 15,
  hard: 20,
  formidable: 25,
  legendary: 30,
};

/** CD per una band di difficolta. */
export function dcForDifficulty(d: Difficulty): number {
  return DC_BY_DIFFICULTY[d];
}
