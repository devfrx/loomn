// Transport HTTP iniettabile. L'adapter non chiama mai fetch direttamente: riceve un
// transport, cosi i test iniettano un fake (nessuna rete reale).

export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  /** Corpo SSE come async-iterable di chunk di byte. Mutuamente esclusivo con `text()`:
   *  il corpo e un ReadableStream a uso singolo, va consumato una volta sola (percorso ok). */
  body(): AsyncIterable<Uint8Array>;
  /** Corpo completo come testo (percorso di errore). Mutuamente esclusivo con `body()`. */
  text(): Promise<string>;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

/** Transport di produzione: avvolge fetch globale. L'adapter resta disaccoppiato da esso. */
export function createFetchTransport(fetchImpl: typeof fetch = fetch): HttpTransport {
  return async (request) => {
    const res = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      body(): AsyncIterable<Uint8Array> {
        const stream = res.body;
        if (stream === null) {
          return (async function* (): AsyncGenerator<Uint8Array> {})();
        }
        // Il ReadableStream di Node e async-iterable a runtime (verificato empiricamente);
        // il tipo della lib non dichiara Symbol.asyncIterator, da cui il cast-ponte.
        return stream as unknown as AsyncIterable<Uint8Array>;
      },
      async text() {
        return res.text();
      },
    };
  };
}
