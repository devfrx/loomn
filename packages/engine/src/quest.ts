// Quest = obiettivo del giocatore. In L1 modella SOLO i fatti meccanici autorevoli (esiste,
// identita, stato): il CODICE possiede la FSM del ciclo di vita (il codice e l arbitro). La
// STORIA della quest (svolte, tradimenti) e narrazione -> vive in L1.5/L2 (via NarrationRecorded,
// F4), non qui. Modulo isolato come difficulty.ts. Stati e esiti come liste esplicite (zero
// rischio di inferenza; il test fissa l invariante QUEST_OUTCOMES sottoinsieme di QUEST_STATUSES).

// Esiti terminali che l AI puo' proporre con advance_quest (sottoinsieme avanzabile-a).
export const QUEST_OUTCOMES = ['completed', 'failed'] as const;
export type QuestOutcome = (typeof QUEST_OUTCOMES)[number];

// Stati completi: 'active' (creazione, posseduto dall engine) + gli esiti terminali.
export const QUEST_STATUSES = ['active', 'completed', 'failed'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

export interface Quest {
  id: string;
  title: string;
  description?: string; // statement canonico dell obiettivo, fissato alla creazione (NON progresso)
  status: QuestStatus;
}
