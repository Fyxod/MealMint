import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DirectiveStore } from '../src/directives.js';
import { SecretStore } from '../src/security.js';

describe('DirectiveStore', () => {
  let directory: string;
  let directives: DirectiveStore;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'mealmint-directives-'));
    directives = new DirectiveStore(new SecretStore(directory));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('persists preferences through SecretStore without writing their text in plaintext', async () => {
    const preference = 'Please avoid peanuts in meals.';
    const saved = await directives.save({ text: preference, source: 'user' });
    const encrypted = await readFile(path.join(directory, 'user-directives.enc'));

    expect(encrypted.includes(Buffer.from(preference))).toBe(false);
    expect(await new DirectiveStore(new SecretStore(directory)).list()).toEqual([saved]);
  });

  it('serializes concurrent saves, deduplicates case-insensitively, and preserves explicit source', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      directives.save({
        text: index % 2 ? 'No peanuts please' : 'NO PEANUTS PLEASE',
        source: index === 19 ? 'user' : 'inferred'
      })
    ));
    await Promise.all(['Prefer vegetarian meals', 'Avoid raw onion', 'Keep sauces separate'].map(text =>
      directives.save({ text, source: 'inferred' })
    ));

    const saved = await directives.list();
    expect(saved).toHaveLength(4);
    expect(saved.filter(item => item.text.toLocaleLowerCase() === 'no peanuts please')).toHaveLength(1);
    expect(saved.find(item => item.text.toLocaleLowerCase() === 'no peanuts please')?.source).toBe('user');
    expect(results.every(result => result.id === results[0].id)).toBe(true);
  });

  it('accepts 500 characters, rejects longer text and credential-like content, and caps the list at 30', async () => {
    const maxText = 'x'.repeat(500);
    expect((await directives.save({ text: maxText, source: 'user' })).text).toBe(maxText);
    expect(() => directives.save({ text: 'x'.repeat(501), source: 'user' })).toThrow();
    expect(() => directives.save({ text: 'api_key=synthetic-example-value', source: 'user' }))
      .toThrow('Store preferences, not credentials.');

    const capacity = new DirectiveStore();
    await Promise.all(Array.from({ length: 30 }, (_, index) =>
      capacity.save({ text: `Stable preference ${index}`, source: 'inferred' })
    ));
    await expect(capacity.save({ text: 'One more stable preference', source: 'user' }))
      .rejects.toThrow('Saved directives are full.');
  });

  it('upgrades an inferred duplicate to user-directed and removes only the requested item', async () => {
    const inferred = await directives.save({ text: 'No cilantro', source: 'inferred' });
    const explicit = await directives.save({ text: 'no CILANTRO', source: 'user' });
    const other = await directives.save({ text: 'Prefer mild spice', source: 'user' });

    expect(explicit.id).toBe(inferred.id);
    expect(explicit.source).toBe('user');
    expect(await directives.remove(explicit.id)).toEqual({ removed: true });
    expect(await directives.remove(explicit.id)).toEqual({ removed: false });
    expect(await directives.list()).toEqual([other]);
  });
});
