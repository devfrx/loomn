import { toDicePlan, type DomainEventView, type DieView, type Outcome } from './dice';

/** Un tiro pronto da animare + readout dei valori autorevoli del motore. */
export interface RolledDice {
  source: 'attack' | 'check' | 'effect';
  /** Etichetta umana della fonte del tiro. */
  tag: string;
  notation: string | null;
  tokens: DieView[];
  modifierTotal: number;
  total: number;
  dc?: number;
  margin?: number;
  outcome?: Outcome;
}

/** Estrae dagli events di un turno/dispatch i tiri animabili, in ordine, ignorando il resto. */
export function extractRolls(events: readonly DomainEventView[]): RolledDice[] {
  const rolls: RolledDice[] = [];
  for (const ev of events) {
    if (ev.type === 'AttackResolved') {
      const plan = toDicePlan(ev.check.dice);
      rolls.push({
        source: 'attack',
        tag: `Attacco -> ${ev.targetId}`,
        notation: plan.notation,
        tokens: plan.tokens,
        modifierTotal: ev.check.modifierTotal,
        total: ev.check.total,
        dc: ev.check.dc,
        margin: ev.check.margin,
        outcome: ev.check.outcome,
      });
    } else if (ev.type === 'CheckResolved') {
      const plan = toDicePlan(ev.result.dice);
      const label = ev.attribute ?? ev.skill ?? ev.difficulty;
      rolls.push({
        source: 'check',
        tag: `Prova (${label})`,
        notation: plan.notation,
        tokens: plan.tokens,
        modifierTotal: ev.result.modifierTotal,
        total: ev.result.total,
        dc: ev.result.dc,
        margin: ev.result.margin,
        outcome: ev.result.outcome,
      });
    } else if (ev.type === 'ResourceEffectApplied') {
      const plan = toDicePlan(ev.roll.dice);
      rolls.push({
        source: 'effect',
        tag: `${ev.resource} ${ev.delta >= 0 ? '+' : ''}${ev.delta}`,
        notation: plan.notation,
        tokens: plan.tokens,
        modifierTotal: ev.roll.modifierTotal,
        total: ev.roll.total,
      });
    }
  }
  return rolls;
}
