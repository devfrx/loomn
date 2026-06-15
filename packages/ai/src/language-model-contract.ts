import { describe, it, expect } from 'vitest';
import { collectResponse, type LanguageModel } from './language-model';

// Suite di conformita condivisa: ogni adapter LanguageModel deve passarla identica
// (spec §9). makeModel ritorna un modello il cui transport sottostante rigioca uno
// stream canonico: testo "pronto", poi una tool-call request_check({"dc":10})
// frammentata, poi finish_reason tool_calls.
export function runLanguageModelContract(label: string, makeModel: () => LanguageModel): void {
  describe(`LanguageModel contract: ${label}`, () => {
    it('espone un id stringa', () => {
      expect(typeof makeModel().id).toBe('string');
    });

    it('trasmette i delta di testo', async () => {
      const res = await collectResponse(makeModel().stream({ messages: [{ role: 'user', content: 'hi' }] }));
      expect(res.text).toBe('pronto');
    });

    it('accumula una tool-call frammentata in un evento intero', async () => {
      const res = await collectResponse(makeModel().stream({ messages: [{ role: 'user', content: 'hi' }] }));
      expect(res.toolCalls).toEqual([{ id: 'call_x', name: 'request_check', arguments: '{"dc":10}' }]);
    });

    it('riporta il finish reason', async () => {
      const res = await collectResponse(makeModel().stream({ messages: [{ role: 'user', content: 'hi' }] }));
      expect(res.finishReason).toBe('tool_calls');
    });
  });
}
