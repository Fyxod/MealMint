// Opt-in live LLM smoke test. Requires an existing Codex ChatGPT sign-in.
// It calls the actual Codex app-server but routes all food tools to synthetic data.
// Run with: CODEX_MODEL=gpt-6-luna CODEX_EFFORT=max node --import tsx scripts/smoke-codex.ts
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CodexProvider } from "../src/codex.js";
import { MockFoodGateway } from "../src/mock.js";
import { FoodService } from "../src/service.js";
import { redact } from "../src/security.js";

const model = process.env.CODEX_MODEL;
const effort = process.env.CODEX_EFFORT;
assert.equal(
  model,
  "gpt-6-luna",
  "Set CODEX_MODEL=gpt-6-luna to run the requested live test.",
);
assert.equal(
  effort,
  "max",
  "Set CODEX_EFFORT=max to run the requested live test.",
);

const runtimeDir = await mkdtemp(
  path.join(os.tmpdir(), "swiggy-mcp-codex-smoke-"),
);
const agent = new CodexProvider({
  bin: process.env.CODEX_BIN || "codex",
  model,
  effort,
  runtimeDir,
});
const gateway = new MockFoodGateway();
const toolCalls: string[] = [];
const originalCall = gateway.call.bind(gateway);
gateway.call = async (name, args) => {
  toolCalls.push(name);
  return originalCall(name, args);
};
const service = new FoodService(gateway, agent);

async function codexRssKb() {
  const pid = (agent as unknown as { proc: { pid?: number } | null }).proc?.pid;
  if (!pid) return null;
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    return Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) || null;
  } catch {
    return null;
  }
}

let summary: Record<string, unknown>;
let failed = false;
try {
  const initial = await agent.status();
  const rssAfterStatus = await codexRssKb();
  assert.equal(
    initial.connected,
    true,
    initial.detail || "Codex did not report a connected ChatGPT session.",
  );

  const conversation = service.create();
  await service.selectAddress(conversation.id, "mock-home");
  const result = await service.chat(
    conversation.id,
    "I am vegetarian and want one dosa with a maximum delivered budget of ₹120. Find options and show me a shortlist only. Do not compare or change any cart.",
  );
  const finalStatus = await agent.status();
  const rssAfterTurn = await codexRssKb();
  const forbiddenWrites = [
    "update_food_cart",
    "apply_food_coupon",
    "flush_food_cart",
  ];

  summary = {
    connected: finalStatus.connected,
    provider: finalStatus.provider,
    selectedModel: finalStatus.model,
    requestedModel: model,
    requestedEffort: effort,
    completed: !result.busy,
    error: result.error,
    preferences: {
      diet: result.request.diet,
      budget: result.request.budget,
      quantity: result.request.quantity,
    },
    foodToolsCalled: toolCalls,
    shortlistCount: result.candidates.length,
    shortlist: result.candidates.map(({ name, price, isVeg, eta }) => ({
      name,
      price,
      isVeg,
      eta,
    })),
    assistantReplyStored: result.messages.some(
      (message) => message.role === "assistant",
    ),
    comparisonApprovalCreated: !!result.approval,
    cartWriteToolsCalled: toolCalls.filter((name) =>
      forbiddenWrites.includes(name),
    ),
    codexAppServerRssKb: {
      afterStatus: rssAfterStatus,
      afterTurn: rssAfterTurn,
    },
  };

  assert.equal(finalStatus.connected, true);
  assert.equal(finalStatus.model, "gpt-6-luna");
  assert.equal(result.error, null);
  assert.equal(result.request.diet, "veg");
  assert.equal(result.request.budget, 120);
  assert.equal(result.request.quantity, 1);
  assert.ok(result.candidates.length > 0);
  assert.ok(
    result.candidates.every(
      (candidate) =>
        candidate.isVeg === true &&
        candidate.price !== null &&
        candidate.price <= 120,
    ),
  );
  assert.ok(result.messages.some((message) => message.role === "assistant"));
  assert.equal(result.approval, null);
  assert.equal(
    toolCalls.some((name) => forbiddenWrites.includes(name)),
    false,
  );
} catch (error) {
  failed = true;
  summary = {
    connected: false,
    requestedModel: model,
    requestedEffort: effort,
    error:
      error instanceof Error ? redact(error.message) : "Unknown smoke failure.",
    foodToolsCalled: toolCalls,
    codexAppServerRssKb: await codexRssKb(),
  };
} finally {
  await service.close();
  await rm(runtimeDir, { recursive: true, force: true });
}

console.log(JSON.stringify(summary));
if (failed) process.exitCode = 1;
