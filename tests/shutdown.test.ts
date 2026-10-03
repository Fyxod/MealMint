import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';

describe('HTTP shutdown', () => {
  let runtime: Awaited<ReturnType<typeof createApp>> | undefined;
  let directory: string | undefined;

  afterEach(async () => {
    if (runtime?.app.server.listening) {
      // Failure-only cleanup: the successful assertion path must prove app.close()
      // ends the stream without the test closing the client connection.
      runtime.app.server.closeAllConnections();
      await runtime.app.close().catch(() => undefined);
    }
    runtime = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it('ends an active SSE response and removes its service listener on app.close()', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'mealmint-shutdown-'));
    runtime = await createApp({
      host: '127.0.0.1',
      port: 0,
      origin: 'http://localhost:5173',
      dataDir: directory,
      provider: 'demo',
      mode: 'mock'
    });

    await runtime.app.listen({ host: '127.0.0.1', port: 0 });
    const address = runtime.app.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected an ephemeral TCP listener.');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const origin = 'http://localhost:5173';

    const loginResponse = await fetch(`${baseUrl}/api/session`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: '{}'
    });
    expect(loginResponse.status).toBe(200);
    const cookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0];
    const { csrf } = await loginResponse.json() as { csrf: string };
    expect(cookie).toBeTruthy();

    const createResponse = await fetch(`${baseUrl}/api/conversations`, {
      method: 'POST',
      headers: {
        origin,
        cookie: cookie!,
        'x-csrf-token': csrf,
        'content-type': 'application/json'
      },
      body: '{}'
    });
    expect(createResponse.status).toBe(200);
    const { id } = await createResponse.json() as { id: string };

    const listenerCountBeforeStream = runtime.service.listenerCount('event');
    const eventsResponse = await fetch(`${baseUrl}/api/conversations/${id}/events`, {
      headers: { cookie: cookie! }
    });
    expect(eventsResponse.status).toBe(200);
    expect(eventsResponse.headers.get('content-type')).toContain('text/event-stream');
    const reader = eventsResponse.body?.getReader();
    expect(reader).toBeDefined();

    const firstChunk = await withTimeout(reader!.read(), 2000, 'Initial SSE event did not arrive.');
    expect(firstChunk.done).toBe(false);
    expect(new TextDecoder().decode(firstChunk.value)).toContain('"type":"state"');
    expect(runtime.service.listenerCount('event')).toBe(listenerCountBeforeStream + 1);

    // Do not cancel or abort the fetch: app.close() must end the server response itself.
    await withTimeout(runtime.app.close(), 2000, 'app.close() did not finish with an SSE response open.');

    const streamEnd = await withTimeout(reader!.read(), 2000, 'The SSE reader did not complete after app.close().');
    expect(streamEnd.done).toBe(true);
    expect(runtime.service.listenerCount('event')).toBe(listenerCountBeforeStream);
  });
});

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
