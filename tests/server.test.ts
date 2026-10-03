import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';

describe('HTTP application security', () => {
  let directory: string;
  let runtimes: Awaited<ReturnType<typeof createApp>>[];

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'mealmint-server-'));
    runtimes = [];
  });

  afterEach(async () => {
    await Promise.all(runtimes.map(runtime => runtime.app.close()));
    await rm(directory, { recursive: true, force: true });
  });

  async function app(options: Parameters<typeof createApp>[0] = {}) {
    const runtime = await createApp({
      host: '127.0.0.1',
      port: 3000,
      origin: 'http://localhost:5173',
      dataDir: directory,
      provider: 'demo',
      mode: 'mock',
      ...options
    });
    runtimes.push(runtime);
    return runtime.app;
  }

  async function login(appServer: Awaited<ReturnType<typeof app>>, origin = 'http://localhost:5173') {
    const response = await appServer.inject({
      method: 'POST', url: '/api/session', headers: { origin }, payload: {}
    });
    return {
      response,
      cookie: String(response.headers['set-cookie']).split(';', 1)[0],
      csrf: response.json().csrf as string
    };
  }

  it('sets baseline security headers and never caches API responses', async () => {
    const server = await app();
    const health = await server.inject('/health');

    expect(health.statusCode).toBe(200);
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['referrer-policy']).toBe('no-referrer');
    expect(health.headers['content-security-policy']).toContain("frame-ancestors 'none'");

    const protectedResponse = await server.inject('/api/status');
    expect(protectedResponse.statusCode).toBe(401);
    expect(protectedResponse.headers['cache-control']).toBe('no-store');
  });

  it('rejects untrusted origins and requires a CSRF token for session writes', async () => {
    const server = await app();
    const crossOrigin = await server.inject({
      method: 'POST', url: '/api/session', headers: { origin: 'https://attacker.example' }, payload: {}
    });
    expect(crossOrigin.statusCode).toBe(403);

    const { cookie, csrf } = await login(server);
    const missingToken = await server.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie, origin: 'http://localhost:5173' }, payload: {}
    });
    const wrongOrigin = await server.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie, origin: 'https://attacker.example', 'x-csrf-token': csrf }, payload: {}
    });
    expect(missingToken.statusCode).toBe(403);
    expect(wrongOrigin.statusCode).toBe(403);

    const accepted = await server.inject({
      method: 'POST', url: '/api/conversations',
      headers: { cookie, origin: 'http://localhost:5173', 'x-csrf-token': csrf }, payload: {}
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('issues a strict HttpOnly session cookie and accepts it on protected reads', async () => {
    const server = await app();
    const { response, cookie, csrf } = await login(server);

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Strict');
    expect(response.headers['set-cookie']).toContain('Path=/');
    expect(response.headers['set-cookie']).not.toContain('Secure');
    const session = await server.inject({ method: 'GET', url: '/api/session', headers: { cookie } });
    const status = await server.inject({ method: 'GET', url: '/api/status', headers: { cookie } });
    expect(session.json()).toMatchObject({ signedIn: true, csrf, local: true, tokenRequired: false });
    expect(status.statusCode).toBe(200);
    expect(status.json().swiggy).toMatchObject({ connected: true, mode: 'mock' });
  });

  it('requires a sufficiently long token and HTTPS origin for public binding', async () => {
    await expect(createApp({ host: '0.0.0.0', origin: 'http://assistant.example.test', accessToken: 'short' }))
      .rejects.toThrow('Hosted use requires HTTPS APP_ORIGIN and an APP_ACCESS_TOKEN of at least 24 characters.');
    await expect(createApp({ host: '0.0.0.0', origin: 'https://assistant.example.test', accessToken: '' }))
      .rejects.toThrow('Hosted use requires HTTPS APP_ORIGIN and an APP_ACCESS_TOKEN of at least 24 characters.');
  });

  it('requires the app token at sign-in and marks public session cookies Secure', async () => {
    const token = 'synthetic-app-access-token-with-enough-length';
    const server = await app({
      host: '0.0.0.0',
      origin: 'https://assistant.example.test',
      accessToken: token
    });
    const bad = await server.inject({
      method: 'POST', url: '/api/session', headers: { origin: 'https://assistant.example.test' }, payload: { token: 'wrong-token' }
    });
    const good = await server.inject({
      method: 'POST', url: '/api/session', headers: { origin: 'https://assistant.example.test' }, payload: { token }
    });

    expect(bad.statusCode).toBe(401);
    expect(good.statusCode).toBe(200);
    expect(good.headers['set-cookie']).toContain('Secure');
    expect(good.headers['set-cookie']).toContain('HttpOnly');
    expect(good.body).not.toContain(token);
  });

  it('marks sessions Secure when localhost sits behind an HTTPS proxy', async () => {
    const token = 'synthetic-app-access-token-with-enough-length';
    const origin = 'https://assistant.example.test';
    const server = await app({ host: '127.0.0.1', origin, accessToken: token });
    const response = await server.inject({
      method: 'POST', url: '/api/session', headers: { origin }, payload: { token }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toContain('Secure');
    expect(response.headers['set-cookie']).toContain('HttpOnly');
  });

  it('keeps mock mode out of both real-account authorization flows', async () => {
    const server = await app();
    const { cookie, csrf } = await login(server);
    const headers = { cookie, origin: 'http://localhost:5173', 'x-csrf-token': csrf };
    const codex = await server.inject({ method: 'POST', url: '/api/auth/codex', headers, payload: {} });
    const swiggy = await server.inject({ method: 'POST', url: '/api/auth/swiggy', headers, payload: {} });

    expect(codex.statusCode).toBe(400);
    expect(codex.json().error).toContain('Switch AGENT_PROVIDER=codex');
    expect(swiggy.statusCode).toBe(400);
    expect(swiggy.json().error).toContain('Mock mode uses synthetic data.');
  });

  it('returns sanitized validation errors without stack traces', async () => {
    const server = await app();
    const { cookie, csrf } = await login(server);
    const response = await server.inject({
      method: 'POST', url: '/api/conversations/not-a-uuid/address',
      headers: { cookie, origin: 'http://localhost:5173', 'x-csrf-token': csrf },
      payload: { addressId: 'mock-home' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid request. Check the fields and try again.' });
    expect(response.body).not.toContain('stack');
  });

  it('protects saved-directive list, create and delete APIs with the session and CSRF controls', async () => {
    const server = await app();
    expect((await server.inject('/api/directives')).statusCode).toBe(401);
    const { cookie, csrf } = await login(server);
    const headers = { cookie, origin: 'http://localhost:5173', 'x-csrf-token': csrf };
    const noCsrf = await server.inject({
      method: 'POST', url: '/api/directives', headers: { cookie, origin: 'http://localhost:5173' },
      payload: { text: 'Avoid peanuts in every meal.' }
    });
    expect(noCsrf.statusCode).toBe(403);

    const savedResponse = await server.inject({
      method: 'POST', url: '/api/directives', headers, payload: { text: 'Avoid peanuts in every meal.' }
    });
    expect(savedResponse.statusCode).toBe(200);
    const saved = savedResponse.json();
    expect(saved).toMatchObject({ text: 'Avoid peanuts in every meal.', source: 'user' });

    const listed = await server.inject({ method: 'GET', url: '/api/directives', headers: { cookie } });
    expect(listed.json()).toEqual([saved]);
    const removed = await server.inject({
      method: 'POST', url: `/api/directives/${saved.id}/delete`, headers, payload: {}
    });
    expect(removed.json()).toEqual({ removed: true });
    expect((await server.inject({ method: 'GET', url: '/api/directives', headers: { cookie } })).json()).toEqual([]);
  });
});
