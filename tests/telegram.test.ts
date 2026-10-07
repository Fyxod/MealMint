import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFoodGateway } from '../src/mock.js';
import { FoodService } from '../src/service.js';
import { SecretStore } from '../src/security.js';
import { TelegramBot } from '../src/telegram.js';
import type { AgentProvider } from '../src/types.js';

// Synthetic Telegram fixture token; the fetcher below intercepts every Bot API request.
const syntheticBotToken = '1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk';
const ownerId = 7310042;

type ApiCall = { method: string; url: URL; body: Record<string, any> };

function fakeTelegramApi() {
  const calls: ApiCall[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl);
    const method = url.pathname.split('/').at(-1)!;
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ method, url, body });

    let result: unknown = true;
    if (method === 'getMe') result = { id: 884422, username: 'SyntheticFoodBot' };
    else if (method === 'sendMessage') result = { message_id: calls.length, chat: { id: body.chat_id } };
    else if (method === 'getUpdates') result = [];
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  return { fetcher, calls };
}

function idleAgent(): AgentProvider {
  return {
    async status() { return { connected: true, provider: 'test' }; },
    async turn() { return 'synthetic reply'; },
    async cancel() {},
    async close() {}
  };
}

function message(userId: number, text: string, chatId = userId, chatType = 'private') {
  return { message: { from: { id: userId }, chat: { id: chatId, type: chatType }, text } };
}

function callback(userId: number, data: string, id = 'synthetic-callback') {
  return {
    callback_query: {
      id,
      from: { id: userId },
      message: { message_id: 1, chat: { id: userId, type: 'private' } },
      data
    }
  };
}

describe('TelegramBot', () => {
  let directory: string;
  let store: SecretStore;
  let runtimes: { service: FoodService; gateway: MockFoodGateway; bot: TelegramBot; calls: ApiCall[] }[];

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'mealmint-telegram-'));
    store = new SecretStore(directory);
    runtimes = [];
  });

  afterEach(async () => {
    for (const runtime of runtimes) runtime.bot.stop();
    await Promise.all(runtimes.map(runtime => runtime.service.close()));
    await rm(directory, { recursive: true, force: true });
  });

  function createBot(agent: AgentProvider = idleAgent()) {
    const gateway = new MockFoodGateway();
    const service = new FoodService(gateway, agent);
    const api = fakeTelegramApi();
    const bot = new TelegramBot(syntheticBotToken, service, store, api.fetcher);
    const runtime = { service, gateway, bot, calls: api.calls };
    runtimes.push(runtime);
    return runtime;
  }

  async function pair(runtime: ReturnType<typeof createBot>, userId = ownerId) {
    const link = await runtime.bot.pairCode();
    const code = new URL(link.url).searchParams.get('start')!;
    await runtime.bot.handle(message(userId, `/start ${code}`));
    return code;
  }

  function addressCallback(runtime: ReturnType<typeof createBot>) {
    return runtime.calls.filter(call => call.method === 'sendMessage' && call.body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data?.startsWith('address:')).at(-1)!.body.reply_markup.inline_keyboard[0][0].callback_data;
  }

  async function waitFor(predicate: () => boolean) {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw new Error('Timed out waiting for the synthetic Telegram update to finish.');
  }

  it('ignores unpaired private users, groups and private chats whose IDs do not match', async () => {
    const runtime = createBot();
    const link = await runtime.bot.pairCode();
    const code = new URL(link.url).searchParams.get('start')!;

    await runtime.bot.handle(message(2001, '/start wrong-code'));
    await runtime.bot.handle(message(2001, `/start ${code}`, -1002001, 'group'));
    await runtime.bot.handle(message(2001, `/start ${code}`, 2002, 'private'));

    expect(runtime.calls.filter(call => call.method === 'sendMessage')).toHaveLength(0);
    expect(runtime.service.conversations.size).toBe(0);
    expect(await store.get('telegram-owner')).toBeNull();
    expect((await runtime.bot.status()).paired).toBe(false);
  });

  it('pairs one owner with a one-use deep link and ignores attempts to reuse it', async () => {
    const runtime = createBot();
    const link = await runtime.bot.pairCode();
    const code = new URL(link.url).searchParams.get('start')!;

    expect(link.url).toMatch(/^https:\/\/t\.me\/SyntheticFoodBot\?start=/);
    expect(link.expiresAt).toBeGreaterThan(Date.now());
    await runtime.bot.handle(message(ownerId, `/start ${code}`));
    await runtime.bot.handle(message(ownerId + 1, `/start ${code}`));

    expect(await store.get('telegram-owner')).toEqual({ id: ownerId });
    expect(await runtime.bot.status()).toMatchObject({ configured: true, paired: true, username: 'SyntheticFoodBot' });
    expect(runtime.calls.filter(call => call.method === 'sendMessage')).toHaveLength(1);
    expect(runtime.calls.find(call => call.method === 'sendMessage')?.body.text).toContain('Connected to MealMint, your personal food assistant.');
  });

  it('selects a saved address and blocks approve callbacks from discarding a nonempty cart', async () => {
    const runtime = createBot();
    await pair(runtime);
    await runtime.bot.handle(message(ownerId, '/addresses'));
    const addressMenu = runtime.calls.filter(call => call.method === 'sendMessage').at(-1)!;
    const buttons = addressMenu.body.reply_markup.inline_keyboard;
    expect(buttons[0][0].text).toMatch(/^Home/);
    expect(buttons[1][0].text).toMatch(/^Office/);
    expect(buttons[0][0].callback_data).toMatch(/^address:[A-Za-z0-9_-]+:0$/);

    await runtime.bot.handle(callback(ownerId, addressCallback(runtime)));
    const conversation = [...runtime.service.conversations.values()][0];
    expect(conversation.channel).toBe('telegram');
    expect(conversation.request.addressId).toBe('mock-home');
    expect(runtime.calls.some(call => call.method === 'answerCallbackQuery')).toBe(true);

    runtime.service.updatePreferences(conversation.id, { budget: 200, diet: 'veg' });
    const search = await runtime.service.dispatch(conversation.id, 'food_search', { query: 'thali' });
    await runtime.service.dispatch(conversation.id, 'food_present', { candidateIds: [search.candidates[0].id] });
    const candidateId = conversation.candidates[0].id;
    await runtime.gateway.call('update_food_cart', {
      restaurantId: 'r2', addressId: 'mock-home', cartItems: [{ menuItemId: 'i4', quantity: 1 }]
    });
    const writesBeforeCompare = runtime.calls.filter(call => ['update_food_cart', 'flush_food_cart', 'apply_food_coupon'].includes(call.method)).length;

    await runtime.bot.handle(callback(ownerId, `compare:${candidateId}`, 'compare-existing-cart'));
    expect(conversation.approval?.status).toBe('pending');
    expect(conversation.approval?.discardExisting).toBe(true);
    const blockedPrompt = runtime.calls.filter(call => call.method === 'sendMessage')
      .find(call => String(call.body.text).startsWith('Your Swiggy cart already has items'))!;
    expect(blockedPrompt).toBeDefined();
    expect(blockedPrompt.body.reply_markup).toBeUndefined();

    await runtime.bot.handle(callback(ownerId, `approve:${conversation.approval!.id}`, 'forged-approve'));
    await waitFor(() => runtime.calls.some(call => call.method === 'sendMessage' && String(call.body.text).includes('Your existing cart would be discarded.')));

    expect(runtime.calls.filter(call => ['update_food_cart', 'flush_food_cart', 'apply_food_coupon'].includes(call.method))).toHaveLength(writesBeforeCompare);
    const stillThere: any = await runtime.gateway.call('get_food_cart', { addressId: 'mock-home' });
    expect(stillThere.data.items[0].menu_item_id).toBe('i4');
  });

  it('keeps the observed address identity when the saved list reorders and rejects stale menus', async () => {
    const runtime = createBot();
    await pair(runtime);
    await runtime.bot.handle(message(ownerId, '/addresses'));
    const oldChoice = addressCallback(runtime);
    const addresses = await runtime.service.addresses();
    vi.spyOn(runtime.service, 'addresses').mockResolvedValue([...addresses].reverse());
    await runtime.bot.handle(callback(ownerId, oldChoice));
    const conversation = [...runtime.service.conversations.values()][0];
    expect(conversation.request.addressId).toBe('mock-home');
    await runtime.bot.handle(message(ownerId, '/addresses'));
    await runtime.bot.handle(callback(ownerId, oldChoice));
    expect(conversation.request.addressId).toBe('mock-home');
    expect(runtime.calls.at(-1)?.body.text).toContain('Address choices expired');
  });

  it('completes an approved callback after the user empties their existing cart', async () => {
    const runtime = createBot();
    await pair(runtime);
    await runtime.bot.handle(message(ownerId, '/addresses'));
    await runtime.bot.handle(callback(ownerId, addressCallback(runtime)));
    const conversation = [...runtime.service.conversations.values()][0];
    runtime.service.updatePreferences(conversation.id, { budget: 200, diet: 'veg' });
    const search = await runtime.service.dispatch(conversation.id, 'food_search', { query: 'thali' });
    await runtime.service.dispatch(conversation.id, 'food_present', { candidateIds: [search.candidates[0].id] });

    await runtime.gateway.call('update_food_cart', {
      restaurantId: 'r2', addressId: 'mock-home', cartItems: [{ menuItemId: 'i4', quantity: 1 }]
    });
    await runtime.bot.handle(callback(ownerId, `compare:${conversation.candidates[0].id}`, 'compare-nonempty'));
    expect(conversation.approval?.discardExisting).toBe(true);

    await runtime.gateway.call('flush_food_cart', {}); // Synthetic user emptied the existing test cart.
    await runtime.bot.handle(callback(ownerId, `compare:${conversation.candidates[0].id}`, 'compare-empty'));
    const approval = conversation.approval!;
    expect(approval.status).toBe('pending');
    expect(approval.discardExisting).toBe(false);
    const approvePrompt = runtime.calls.filter(call => call.method === 'sendMessage')
      .find(call => String(call.body.text).startsWith('Check these exact options by temporarily'))!;
    expect(approvePrompt.body.reply_markup.inline_keyboard[0][0]).toMatchObject({
      text: 'Approve comparison',
      callback_data: `approve:${approval.id}`
    });

    await runtime.bot.handle(callback(ownerId, `approve:${approval.id}`, 'approve-empty'));
    await waitFor(() => conversation.approval?.status === 'done');

    expect(conversation.quotes).toHaveLength(1);
    expect(conversation.quotes[0].name).toBe('Veg thali');
    const finalCart: any = await runtime.gateway.call('get_food_cart', { addressId: 'mock-home' });
    expect(finalCart.data.items).toEqual([]);
  });

  it('keeps the current conversation when /new arrives while the agent is busy', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const agent: AgentProvider = {
      ...idleAgent(),
      async turn() { await gate; return 'synthetic finished response'; }
    };
    const runtime = createBot(agent);
    await pair(runtime);

    await runtime.bot.handle(message(ownerId, 'hello assistant'));
    const conversation = [...runtime.service.conversations.values()][0];
    expect(conversation.busy).toBe(true);

    await runtime.bot.handle(message(ownerId, '/new'));

    expect(runtime.service.conversations.has(conversation.id)).toBe(true);
    expect(conversation.busy).toBe(true);
    expect(runtime.calls.filter(call => call.method === 'sendMessage').at(-1)?.body.text)
      .toContain('Use /cancel, then wait for the operation to finish');

    release();
    await waitFor(() => !conversation.busy);
    await runtime.bot.handle(message(ownerId, '/new'));
    expect(runtime.service.conversations.has(conversation.id)).toBe(false);
  });

  it('saves a Telegram preference before address selection and exposes it to a web conversation', async () => {
    let telegramContext: any;
    const agent: AgentProvider = {
      ...idleAgent(),
      async turn(_conversationId, _text, _tools, dispatch) {
        await dispatch('food_remember', {
          text: 'Avoid peanuts in every meal.',
          source: 'user'
        });
        telegramContext = await dispatch('food_context', {});
        return 'I will remember that preference.';
      }
    };
    const runtime = createBot(agent);
    await pair(runtime);

    await runtime.bot.handle(message(ownerId, 'Please remember that I avoid peanuts.'));
    await waitFor(() => [...runtime.service.conversations.values()].some(conversation =>
      !conversation.busy && conversation.messages.some(item => item.role === 'assistant')
    ));
    const telegramConversation = [...runtime.service.conversations.values()][0];
    expect(telegramConversation.request.addressId).toBeNull();
    expect(telegramContext.directives).toHaveLength(1);
    expect(telegramContext.directives[0]).toMatchObject({
      text: 'Avoid peanuts in every meal.',
      source: 'user'
    });

    const webConversation = runtime.service.create('web');
    expect((await runtime.service.dispatch(webConversation.id, 'food_context', {})).directives)
      .toEqual(telegramContext.directives);
    await runtime.service.dispatch(webConversation.id, 'food_forget', {
      directiveId: telegramContext.directives[0].id
    });
    expect((await runtime.service.dispatch(telegramConversation.id, 'food_context', {})).directives).toEqual([]);
  });
});
