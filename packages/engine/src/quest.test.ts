import { describe, it, expect } from 'vitest';
import { QUEST_STATUSES, QUEST_OUTCOMES } from './quest';

describe('costanti di stato delle quest', () => {
  it('QUEST_STATUSES ha i tre stati attesi', () => {
    expect(QUEST_STATUSES).toEqual(['active', 'completed', 'failed']);
  });

  it('QUEST_OUTCOMES e il sottoinsieme terminale di QUEST_STATUSES', () => {
    expect(QUEST_OUTCOMES).toEqual(['completed', 'failed']);
    for (const o of QUEST_OUTCOMES) {
      expect(QUEST_STATUSES).toContain(o);
    }
    expect(QUEST_OUTCOMES).not.toContain('active');
  });
});
