import { describe, it, expect } from 'vitest';
import { createRecordingTracer, noopTracer } from './tracing';

describe('tracing', () => {
  it('il recording tracer accumula gli eventi in ordine', () => {
    const t = createRecordingTracer();
    t.record({ kind: 'request', model: 'm', messageCount: 2, hasTools: false });
    t.record({ kind: 'error', message: 'boom' });
    expect(t.events.map((e) => e.kind)).toEqual(['request', 'error']);
  });

  it('il noop tracer non lancia e non registra nulla', () => {
    expect(() => noopTracer.record({ kind: 'error', message: 'x' })).not.toThrow();
  });
});
