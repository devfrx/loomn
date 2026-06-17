import { describe, it, expect } from 'vitest';
import type { StoredEvent } from '@loomn/engine';
import { segmentScenes } from './scene-segmentation';

const added = (seq: number): StoredEvent => ({
  seq,
  event: { type: 'ActorAdded', actor: { id: `a${seq}`, name: `A${seq}`, kind: 'npc', attributes: {}, skills: {}, resources: {}, conditions: [], items: [], progression: { xp: 0, level: 1 } } },
});
const phase = (seq: number): StoredEvent => ({ seq, event: { type: 'PhaseChanged', from: 'exploration', to: 'combat' } });

/** Estrae i seq di ogni scena (per asserire contiguita e non-sovrapposizione). */
function seqs(scenes: StoredEvent[][]): number[][] {
  return scenes.map((s) => s.map((e) => e.seq));
}

describe('segmentScenes', () => {
  it('senza PhaseChanged ritorna una sola scena con tutti gli eventi', () => {
    expect(seqs(segmentScenes([added(1), added(2), added(3)]))).toEqual([[1, 2, 3]]);
  });

  it('un PhaseChanged in mezzo produce due scene contigue e non sovrapposte', () => {
    // Il PhaseChanged TERMINA la scena corrente (e l ultimo evento di quella scena).
    expect(seqs(segmentScenes([added(1), phase(2), added(3)]))).toEqual([[1, 2], [3]]);
  });

  it('un PhaseChanged come ultimo evento non lascia una scena vuota in coda', () => {
    expect(seqs(segmentScenes([added(1), phase(2)]))).toEqual([[1, 2]]);
  });

  it('due PhaseChanged consecutivi danno una scena intermedia mono-evento', () => {
    expect(seqs(segmentScenes([added(1), phase(2), phase(3), added(4)]))).toEqual([[1, 2], [3], [4]]);
  });

  it('una lista vuota ritorna nessuna scena', () => {
    expect(segmentScenes([])).toEqual([]);
  });
});
