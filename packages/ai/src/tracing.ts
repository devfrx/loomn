// TracingPort, trasversale dal giorno 1 (spec §7). Tempo/IO vivono nell'implementazione
// del tracer, NON nei TraceEvent che i chiamanti costruiscono (mantiene puri i chiamanti).
// In 7b la union verra estesa con 'validation-failure' e 'retry'.

export type TraceEvent =
  | { kind: 'request'; model: string; messageCount: number; hasTools: boolean }
  | { kind: 'response'; finishReason: string; textLength: number; toolCallCount: number }
  | { kind: 'error'; message: string };

export interface TracingPort {
  record(event: TraceEvent): void;
}

/** Tracer no-op di default (cosi il wiring e sempre presente, spec §7). */
export const noopTracer: TracingPort = { record() {} };

/** Tracer in-memory per test/asserzioni. */
export interface RecordingTracer extends TracingPort {
  readonly events: readonly TraceEvent[];
}

export function createRecordingTracer(): RecordingTracer {
  const events: TraceEvent[] = [];
  return {
    events,
    record(event) {
      events.push(event);
    },
  };
}
