import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { redact, safeEqual, SecretStore } from '../src/security.js';

describe('security helpers', () => {
  it('compares equal and unequal strings safely, including different lengths', () => {
    expect(safeEqual('same-value', 'same-value')).toBe(true);
    expect(safeEqual('same-value', 'other-value')).toBe(false);
    expect(safeEqual('short', 'much-longer')).toBe(false);
  });

  it('redacts bearer, JWT, Telegram and OAuth secrets from logs', () => {
    const fixtures = {
      bearer: 'synthetic-bearer-secret',
      jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c2lnbmF0dXJl',
      telegram: '1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk',
      code: 'synthetic-auth-code',
      state: 'synthetic-state-value',
      access: 'synthetic-access-token',
      refresh: 'synthetic-refresh-token',
      verifier: 'synthetic-code-verifier'
    };
    const log = [
      `Authorization: Bearer ${fixtures.bearer}`,
      `session ${fixtures.jwt}`,
      `https://example.test/callback?code=${fixtures.code}&state=${fixtures.state}`,
      `access_token=${fixtures.access} refresh_token=${fixtures.refresh} code_verifier=${fixtures.verifier}`,
      `telegram bot ${fixtures.telegram}`
    ].join(' | ');

    const result = redact(log);
    for (const secret of Object.values(fixtures)) expect(result).not.toContain(secret);
    expect(result).toContain('Bearer [redacted]');
    expect(result).toContain('[token]');
    expect(result).toContain('[bot-token]');
    expect(result).toContain('code=[redacted]');
    expect(result).toContain('state=[redacted]');
  });
});

describe('SecretStore', () => {
  let directory: string;
  let store: SecretStore;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'mealmint-secrets-'));
    store = new SecretStore(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('encrypts and decrypts values in private files', async () => {
    const value = { accessToken: 'synthetic-access-secret', refreshToken: 'synthetic-refresh-secret' };
    await store.set('swiggy-auth', value);

    const encrypted = await readFile(path.join(directory, 'swiggy-auth.enc'));
    expect(encrypted.includes(Buffer.from(value.accessToken))).toBe(false);
    expect(await store.get('swiggy-auth')).toEqual(value);
    expect((await stat(path.join(directory, 'encryption.key'))).mode & 0o777).toBe(0o600);
    expect((await stat(path.join(directory, 'swiggy-auth.enc'))).mode & 0o777).toBe(0o600);
  });

  it('returns null for a missing value and rejects unsafe names', async () => {
    expect(await store.get('missing-secret')).toBeNull();
    await expect(store.set('../outside', 'value')).rejects.toThrow('Invalid secret name.');
    await expect(store.get('name/escape')).rejects.toThrow('Invalid secret name.');
  });

  it('detects tampered ciphertext', async () => {
    await store.set('bot-token', 'synthetic-bot-token');
    const file = path.join(directory, 'bot-token.enc');
    const bytes = await readFile(file);
    bytes[bytes.length - 1] ^= 1;
    await writeFile(file, bytes);

    await expect(store.get('bot-token')).rejects.toThrow();
  });

  it('supports simultaneous first writes without losing either secret', async () => {
    const left = new SecretStore(directory);
    const right = new SecretStore(directory);
    await Promise.all([
      left.set('swiggy-auth', { token: 'synthetic-swiggy-token' }),
      right.set('codex-auth', { token: 'synthetic-codex-token' })
    ]);

    expect(await left.get('swiggy-auth')).toEqual({ token: 'synthetic-swiggy-token' });
    expect(await right.get('codex-auth')).toEqual({ token: 'synthetic-codex-token' });
  });

  it('atomically replaces one encrypted value during concurrent updates', async () => {
    const values = Array.from({ length: 12 }, (_, index) => `synthetic-directive-value-${index}`);
    await Promise.all(values.map(value => store.set('current-preference', { value })));

    const persisted = await store.get<{ value: string }>('current-preference');
    expect(persisted).not.toBeNull();
    expect(values).toContain(persisted!.value);
    const ciphertext = await readFile(path.join(directory, 'current-preference.enc'));
    expect(values.some(value => ciphertext.includes(Buffer.from(value)))).toBe(false);
    expect((await readdir(directory)).some(name => name.endsWith('.tmp'))).toBe(false);
  });
});
