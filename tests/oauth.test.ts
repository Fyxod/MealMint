import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwiggyOAuth } from '../src/oauth.js';
import { SecretStore } from '../src/security.js';

const base = 'https://mcp.swiggy.com';
const redirectUri = 'http://localhost:3000/auth/swiggy/callback';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/auth/token`,
    registration_endpoint: `${base}/oauth/register`,
    ...overrides
  };
}

function mockFetch(handler?: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const value = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(value);
    calls.push({ url, init });
    if (handler) return handler(url, init);
    if (url.pathname === '/.well-known/oauth-authorization-server') return json(metadata());
    if (url.pathname === '/oauth/register') return json({ client_id: 'synthetic-client-id' });
    if (url.pathname === '/auth/token') return json({ access_token: 'synthetic-access-token', expires_in: 3600 });
    if (url.pathname === '/auth/logout') return json({ logged_out: true });
    return json({ error: 'unexpected test request' }, 404);
  };
  return { fetcher, calls };
}

describe('SwiggyOAuth', () => {
  let directory: string;
  let store: SecretStore;
  let dateNow: any;

  beforeEach(async () => {
    dateNow = vi.spyOn(Date, 'now');
    directory = await mkdtemp(path.join(os.tmpdir(), 'mealmint-oauth-'));
    store = new SecretStore(directory);
  });

  afterEach(async () => {
    dateNow.mockRestore();
    await rm(directory, { recursive: true, force: true });
  });

  it('restricts the authorization host and callback URL', () => {
    const fetcher = mockFetch().fetcher;
    expect(() => new SwiggyOAuth(store, redirectUri, 'https://attacker.example', fetcher))
      .toThrow('Use an official Swiggy authorization server.');
    expect(() => new SwiggyOAuth(store, 'http://example.test/auth/swiggy/callback', base, fetcher))
      .toThrow('Use an HTTPS callback or http://localhost for development.');
    expect(() => new SwiggyOAuth(store, 'https://assistant.example.test/callback', base, fetcher))
      .toThrow('Use an HTTPS callback or http://localhost for development.');
  });

  it('creates a one-time state and an S256 PKCE challenge for the saved client', async () => {
    const { fetcher, calls } = mockFetch();
    const oauth = new SwiggyOAuth(store, redirectUri, base, fetcher);
    const { url } = await oauth.start();
    const authorize = new URL(url);
    const state = authorize.searchParams.get('state')!;
    const registration = calls.find(x => x.url.pathname === '/oauth/register')!;
    const registrationBody = JSON.parse(String(registration.init?.body));

    expect(state).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(authorize.origin).toBe(base);
    expect(authorize.searchParams.get('response_type')).toBe('code');
    expect(authorize.searchParams.get('client_id')).toBe('synthetic-client-id');
    expect(authorize.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('scope')).toBe('mcp:tools');
    expect(authorize.searchParams.get('resource')).toBe(`${base}/food`);
    expect(registrationBody).toMatchObject({
      client_name: 'MealMint',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code']
    });
    expect(calls.every(x => x.init?.redirect === 'error')).toBe(true);
  });

  it('rejects a mismatched or reused state before contacting the token endpoint', async () => {
    const { fetcher, calls } = mockFetch();
    const oauth = new SwiggyOAuth(store, redirectUri, base, fetcher);
    const { url } = await oauth.start();
    const state = new URL(url).searchParams.get('state')!;

    await expect(oauth.callback('synthetic-code', `${state}wrong`))
      .rejects.toThrow('Sign-in expired or state is invalid. Start again.');
    expect(calls.some(x => x.url.pathname === '/auth/token')).toBe(false);

    await oauth.callback('synthetic-code', state);
    await expect(oauth.callback('synthetic-code', state))
      .rejects.toThrow('Sign-in expired or state is invalid. Start again.');
    expect(calls.filter(x => x.url.pathname === '/auth/token')).toHaveLength(1);
  });

  it('exchanges a valid code with its matching PKCE verifier and stores only a bounded token', async () => {
    const { fetcher, calls } = mockFetch();
    const oauth = new SwiggyOAuth(store, redirectUri, base, fetcher);
    const { url } = await oauth.start();
    const authorize = new URL(url);
    const state = authorize.searchParams.get('state')!;

    await oauth.callback('synthetic-authorization-code', state);

    const exchange = calls.find(x => x.url.pathname === '/auth/token')!;
    const body = JSON.parse(String(exchange.init?.body));
    expect(body).toMatchObject({
      grant_type: 'authorization_code',
      client_id: 'synthetic-client-id',
      code: 'synthetic-authorization-code',
      redirect_uri: redirectUri,
      resource: `${base}/food`
    });
    expect(authorize.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(body.code_verifier).digest('base64url')
    );
    expect(await oauth.token()).toBe('synthetic-access-token');
    expect(await oauth.status()).toMatchObject({ connected: true, redirectUri });
  });

  it('consumes state even when the token exchange fails', async () => {
    const { fetcher, calls } = mockFetch((url) => {
      if (url.pathname === '/.well-known/oauth-authorization-server') return json(metadata());
      if (url.pathname === '/oauth/register') return json({ client_id: 'synthetic-client-id' });
      if (url.pathname === '/auth/token') return json({ error: 'temporary failure' }, 503);
      return json({}, 404);
    });
    const oauth = new SwiggyOAuth(store, redirectUri, base, fetcher);
    const state = new URL((await oauth.start()).url).searchParams.get('state')!;

    await expect(oauth.callback('synthetic-code', state)).rejects.toThrow('Swiggy authorization request failed (503).');
    await expect(oauth.callback('synthetic-code', state))
      .rejects.toThrow('Sign-in expired or state is invalid. Start again.');
    expect(calls.filter(x => x.url.pathname === '/auth/token')).toHaveLength(1);
  });

  it('rejects a hostile endpoint from authorization-server metadata', async () => {
    const { fetcher, calls } = mockFetch(url => url.pathname === '/.well-known/oauth-authorization-server'
      ? json(metadata({ authorization_endpoint: 'https://attacker.example/authorize' }))
      : json({ client_id: 'should-not-register' }));
    const oauth = new SwiggyOAuth(store, redirectUri, base, fetcher);

    await expect(oauth.start()).rejects.toThrow('Untrusted OAuth endpoint.');
    expect(calls.some(x => x.url.pathname === '/oauth/register')).toBe(false);
  });

  it('expires pending state and limits concurrent sign-ins', async () => {
    dateNow.mockReturnValue(1_000_000);
    const { fetcher, calls } = mockFetch();
    const oauth = new SwiggyOAuth(store, redirectUri, base, fetcher);
    const state = new URL((await oauth.start()).url).searchParams.get('state')!;
    dateNow.mockReturnValue(1_000_000 + 10 * 60_000 + 1);
    await expect(oauth.callback('synthetic-code', state))
      .rejects.toThrow('Sign-in expired or state is invalid. Start again.');

    dateNow.mockReturnValue(2_000_000);
    for (let i = 0; i < 5; i++) await oauth.start();
    const before = calls.length;
    await expect(oauth.start()).rejects.toThrow('Too many pending sign-ins.');
    expect(calls).toHaveLength(before);
  });

  it('uses a one-minute expiry margin and clears a token when logout fails', async () => {
    const { fetcher } = mockFetch(url => url.pathname === '/auth/logout'
      ? json({ error: 'temporary failure' }, 503)
      : url.pathname === '/.well-known/oauth-authorization-server'
        ? json(metadata())
        : json({ client_id: 'synthetic-client-id' }));
    const oauth = new SwiggyOAuth(store, redirectUri, base, fetcher);
    const now = Date.now();
    await store.set('swiggy-token', { access_token: 'synthetic-access-token', expiresAt: now + 60_000 });
    expect(await oauth.token()).toBeNull();
    await store.set('swiggy-token', { access_token: 'synthetic-access-token', expiresAt: now + 5 * 60_000 });

    await expect(oauth.disconnect()).rejects.toThrow('Swiggy authorization request failed (503).');
    expect(await store.get('swiggy-token')).toBeNull();
  });
});
