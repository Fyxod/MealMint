// Opt-in live-agent regression for durable remembering and exact cart bundles.
// Uses the actual Codex app-server with the synthetic FoodGateway only.
// Run with: CODEX_MODEL=gpt-6-luna CODEX_EFFORT=max node --import tsx scripts/smoke-codex-advanced.ts
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexProvider } from '../src/codex.js';
import { DirectiveStore } from '../src/directives.js';
import { MockFoodGateway } from '../src/mock.js';
import { FoodService } from '../src/service.js';
import { SecretStore, redact } from '../src/security.js';

const model = process.env.CODEX_MODEL;
const effort = process.env.CODEX_EFFORT;
assert.equal(model, 'gpt-6-luna', 'Set CODEX_MODEL=gpt-6-luna to run the requested live test.');
assert.equal(effort, 'max', 'Set CODEX_EFFORT=max to run the requested live test.');

const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'swiggy-mcp-codex-advanced-'));
const secretDir = path.join(runtimeDir, 'preferences');
const agent = new CodexProvider({
  bin: process.env.CODEX_BIN || 'codex',
  model,
  effort,
  runtimeDir: path.join(runtimeDir, 'agent')
});
const gateway = new MockFoodGateway();
const toolCalls: string[] = [];
const bundleResults: any[] = [];
const originalCall = gateway.call.bind(gateway);
gateway.call = async (name, args) => {
  if (['update_food_cart', 'apply_food_coupon', 'flush_food_cart'].includes(name)) toolCalls.push(name);
  return originalCall(name, args);
};
const directives = new DirectiveStore(new SecretStore(secretDir));
const service = new FoodService(gateway, agent, { directives });
const originalDispatch = service.dispatch.bind(service);
service.dispatch = async (id, name, args) => {
  toolCalls.push(name);
  const result = await originalDispatch(id, name, args);
  if (name === 'food_bundle') bundleResults.push(structuredClone(result));
  return result;
};

let summary: Record<string, unknown>;
let failed = false;
try {
  const initial = await agent.status();
  assert.equal(initial.connected, true, initial.detail || 'Codex is not connected.');

  const conversation = service.create();
  await service.selectAddress(conversation.id, 'mock-home');
  const result = await service.chat(
    conversation.id,
    'Please remember as a user preference that I avoid peanuts. For this meal, I am vegetarian, want exactly one Plain dosa and one Idli with sambar from the same restaurant, and my maximum delivered budget is ₹250 for one bundle. Set my request from those constraints, search the synthetic menu, and use food_bundle to propose the exact two items together if they are available. Tell me the listed subtotal and that the delivered total still needs an approved check. Do not compare, approve, or change any cart.'
  );
  const saved = await directives.list();
  const bundle = bundleResults.at(-1)?.candidate;
  const lines = bundle?.lines?.map((line: any) => [line.itemId, line.quantity]).sort(([a]: string[], [b]: string[]) => a.localeCompare(b));
  const forbiddenWrites = ['update_food_cart', 'apply_food_coupon', 'flush_food_cart'];
  const finalStatus = await agent.status();

  summary = {
    connected: finalStatus.connected,
    selectedModel: finalStatus.model,
    requestedModel: model,
    requestedEffort: effort,
    completed: !result.busy,
    error: result.error,
    request: {
      diet: result.request.diet,
      budget: result.request.budget,
      quantity: result.request.quantity
    },
    foodToolsCalled: toolCalls.filter(name => !forbiddenWrites.includes(name)),
    savedDirectives: saved.map(({ source, text }) => ({ source, text })),
    proposedBundle: bundle ? {
      restaurant: bundle.restaurant,
      lines,
      listedSubtotal: bundle.price,
      dealHypothesis: bundle.dealHypothesis ?? false
    } : null,
    comparisonApprovalCreated: !!result.approval,
    cartWriteToolsCalled: toolCalls.filter(name => forbiddenWrites.includes(name))
  };

  assert.equal(finalStatus.connected, true);
  assert.equal(finalStatus.model, 'gpt-6-luna');
  assert.equal(result.error, null);
  assert.deepEqual({
    budget: result.request.budget,
    diet: result.request.diet,
    quantity: result.request.quantity
  }, { budget: 250, diet: 'veg', quantity: 1 });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].source, 'user');
  assert.ok(/peanuts/i.test(saved[0].text));
  assert.ok(bundle, 'Codex did not propose a food_bundle.');
  assert.equal(bundle.restaurantId, 'r3');
  assert.equal(bundle.price, 108);
  assert.deepEqual(lines, [['i7', 1], ['i8', 1]]);
  assert.equal(result.approval, null);
  assert.equal(result.quotes.length, 0);
  assert.deepEqual(toolCalls.filter(name => forbiddenWrites.includes(name)), []);
} catch (error) {
  failed = true;
  summary = {
    connected: false,
    requestedModel: model,
    requestedEffort: effort,
    error: error instanceof Error ? redact(error.message) : 'Unknown advanced smoke failure.',
    foodToolsCalled: toolCalls.filter(name => !['update_food_cart', 'apply_food_coupon', 'flush_food_cart'].includes(name)),
    savedDirectiveCount: await directives.list().then(items => items.length).catch(() => null),
    bundleCandidateObserved: bundleResults.length > 0,
    cartWriteToolsCalled: toolCalls.filter(name => ['update_food_cart', 'apply_food_coupon', 'flush_food_cart'].includes(name))
  };
} finally {
  await service.close();
  await rm(runtimeDir, { recursive: true, force: true });
}

console.log(JSON.stringify(summary));
if (failed) process.exitCode = 1;
