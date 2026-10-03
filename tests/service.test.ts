import { describe, expect, it, vi } from 'vitest';
import { MockFoodGateway } from '../src/mock.js';
import { FoodService } from '../src/service.js';
import type { AgentProvider } from '../src/types.js';

function idleAgent(): AgentProvider {
  return {
    async status() { return { connected: true, provider: 'test' }; },
    async turn() { return 'test response'; },
    async cancel() {},
    async close() {}
  };
}

async function readyService() {
  const gateway = new MockFoodGateway();
  const service = new FoodService(gateway, idleAgent());
  const conversation = service.create();
  await service.selectAddress(conversation.id, 'mock-home');
  return { gateway, service, conversation };
}

async function getMockCart(gateway: MockFoodGateway) {
  return await gateway.call('get_food_cart', { addressId: 'mock-home' }) as any;
}

describe('FoodService', () => {
  it('enforces diet, quantity-adjusted budget, ETA and excluded terms server-side', async () => {
    const { service, conversation } = await readyService();
    service.updatePreferences(conversation.id, {
      budget: 160,
      diet: 'veg',
      quantity: 2,
      maxMinutes: 25,
      excluded: ['plain']
    });

    const result = await service.dispatch(conversation.id, 'food_search', { query: 'dosa' });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((candidate: any) =>
      candidate.available && candidate.isVeg === true && candidate.price * 2 <= 160 &&
      candidate.eta <= 25 && !candidate.name.toLowerCase().includes('idli')
    )).toBe(true);
    expect(result.candidates.map((candidate: any) => candidate.name)).toEqual(['Masala dosa']);

    service.updatePreferences(conversation.id, { budget: 120, excluded: [] });
    const underBudget = await service.dispatch(conversation.id, 'food_search', { query: 'dosa' });
    expect(underBudget.candidates.map((candidate: any) => candidate.name)).toEqual(['Plain dosa']);
    expect(underBudget.candidates.every((candidate: any) => candidate.price * conversation.request.quantity <= 120)).toBe(true);
  });

  it('rejects invalid preferences and preserves fields omitted from an update', async () => {
    const { service, conversation } = await readyService();
    service.updatePreferences(conversation.id, { budget: 200, diet: 'veg', quantity: 2 });
    service.updatePreferences(conversation.id, { maxMinutes: 30 });

    expect(conversation.request).toMatchObject({ budget: 200, diet: 'veg', quantity: 2, maxMinutes: 30 });
    expect(() => service.updatePreferences(conversation.id, { budget: -1 })).toThrow();
    expect(() => service.updatePreferences(conversation.id, { quantity: 1.5 })).toThrow();
    expect(() => service.updatePreferences(conversation.id, { diet: 'vegan' })).toThrow();
    expect(() => service.updatePreferences(conversation.id, { budget: 200, unexpected: true })).toThrow();
  });

  it('returns only an address selection alias to the agent', async () => {
    const { service, conversation } = await readyService();

    const context = await service.dispatch(conversation.id, 'food_context', {});
    const preferences = await service.dispatch(conversation.id, 'food_preferences', { budget: 150, diet: 'veg' });

    expect(context.request.addressId).toBe('selected');
    expect(context.addresses).toEqual([
      { label: 'Home', selected: true },
      { label: 'Office', selected: false }
    ]);
    expect(preferences.addressId).toBe('selected');
    expect(JSON.stringify({ context, preferences })).not.toContain('mock-home');
  });

  it('requires a saved address before searching and rejects invented candidate handles', async () => {
    const service = new FoodService(new MockFoodGateway(), idleAgent());
    const conversation = service.create();
    await expect(service.dispatch(conversation.id, 'food_search', { query: 'dosa' }))
      .rejects.toThrow('Ask the user to select a saved delivery address first.');
    await expect(service.dispatch(conversation.id, 'food_present', { candidateIds: ['invented-option'] }))
      .rejects.toThrow('Ask the user to select a saved delivery address first.');
  });

  it('does not modify a cart when it first creates an explicit comparison approval', async () => {
    const { gateway, service, conversation } = await readyService();
    service.updatePreferences(conversation.id, { budget: 200, diet: 'veg' });
    const search = await service.dispatch(conversation.id, 'food_search', { query: 'thali' });
    const candidateId = search.candidates[0].id;
    const call = vi.spyOn(gateway, 'call');

    const approval: any = await service.dispatch(conversation.id, 'food_compare', { candidateIds: [candidateId] });

    expect(approval).toMatchObject({ status: 'pending', discardExisting: false });
    expect(call.mock.calls.map(([name]) => name)).toContain('get_food_cart');
    expect(call.mock.calls.map(([name]) => name)).not.toContain('update_food_cart');
    expect(call.mock.calls.map(([name]) => name)).not.toContain('apply_food_coupon');
  });

  it('checks exact delivered totals and eligible coupon savings only after approval', async () => {
    const { gateway, service, conversation } = await readyService();
    service.updatePreferences(conversation.id, { budget: 150, diet: 'veg' });
    const search = await service.dispatch(conversation.id, 'food_search', { query: 'thali' });
    const candidateId = search.candidates[0].id;
    const approval: any = await service.requestComparison(conversation.id, [candidateId]);

    expect((await getMockCart(gateway)).data.items).toEqual([]);
    expect(approval.status).toBe('pending');

    const result = await service.approve(conversation.id, approval.id);

    expect(result.approval?.status).toBe('done');
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]).toMatchObject({
      name: 'Veg thali',
      quantity: 1,
      itemTotal: 129,
      delivery: 24,
      charges: 14.45,
      discount: 25.8,
      coupon: 'SAVE20',
      total: 141.65,
      withinBudget: true,
      bundle: false,
      source: 'mock'
    });
    expect((await getMockCart(gateway)).data.items).toEqual([]);
  });

  it('requires separate confirmation before replacing an existing cart', async () => {
    const { gateway, service, conversation } = await readyService();
    service.updatePreferences(conversation.id, { budget: 200, diet: 'veg' });
    await gateway.call('update_food_cart', {
      restaurantId: 'r2', addressId: 'mock-home', cartItems: [{ menuItemId: 'i4', quantity: 1 }]
    });
    const search = await service.dispatch(conversation.id, 'food_search', { query: 'thali' });
    const approval: any = await service.requestComparison(conversation.id, [search.candidates[0].id]);

    expect(approval.discardExisting).toBe(true);
    await expect(service.approve(conversation.id, approval.id)).rejects.toThrow('Explicitly confirm that first.');
    expect((await getMockCart(gateway)).data.items[0].menu_item_id).toBe('i4');
  });

  it('stops before cart writes if the cart changed after approval', async () => {
    const { gateway, service, conversation } = await readyService();
    service.updatePreferences(conversation.id, { budget: 200, diet: 'veg' });
    const search = await service.dispatch(conversation.id, 'food_search', { query: 'thali' });
    const approval: any = await service.requestComparison(conversation.id, [search.candidates[0].id]);
    await gateway.call('update_food_cart', {
      restaurantId: 'r2', addressId: 'mock-home', cartItems: [{ menuItemId: 'i4', quantity: 1 }]
    });
    const call = vi.spyOn(gateway, 'call');

    const result = await service.approve(conversation.id, approval.id);

    expect(result.error).toContain('Cart changed since approval.');
    expect(call.mock.calls.map(([name]) => name)).not.toContain('update_food_cart');
    expect(call.mock.calls.map(([name]) => name)).not.toContain('flush_food_cart');
    expect((await getMockCart(gateway)).data.items[0].menu_item_id).toBe('i4');
  });

  it('allows only one cart comparison at a time across conversations', async () => {
    const gateway = new MockFoodGateway();
    const service = new FoodService(gateway, idleAgent());
    const first = service.create();
    const second = service.create();
    await service.selectAddress(first.id, 'mock-home');
    await service.selectAddress(second.id, 'mock-home');
    service.updatePreferences(first.id, { budget: 200 });
    service.updatePreferences(second.id, { budget: 200 });
    const firstSearch = await service.dispatch(first.id, 'food_search', { query: 'thali' });
    const secondSearch = await service.dispatch(second.id, 'food_search', { query: 'roll' });
    const firstApproval: any = await service.requestComparison(first.id, [firstSearch.candidates[0].id]);
    const secondApproval: any = await service.requestComparison(second.id, [secondSearch.candidates[0].id]);

    const originalCall = gateway.call.bind(gateway);
    let announceWaiting!: () => void;
    let release!: () => void;
    const waitingForCart = new Promise<void>(resolve => { announceWaiting = resolve; });
    const releaseCart = new Promise<void>(resolve => { release = resolve; });
    let holdFirstCartRead = true;
    gateway.call = async (name, args) => {
      if (holdFirstCartRead && name === 'get_food_cart') {
        holdFirstCartRead = false;
        announceWaiting();
        await releaseCart;
      }
      return originalCall(name, args);
    };

    const firstRun = service.approve(first.id, firstApproval.id);
    await waitingForCart;
    await expect(service.approve(second.id, secondApproval.id)).rejects.toThrow('An operation is already running.');
    release();
    await firstRun;

    expect(first.approval?.status).toBe('done');
    expect(second.approval?.status).toBe('pending');
    expect((await getMockCart(gateway)).data.items).toEqual([]);
  });

  it('completes an approved comparison of three observed candidates and restores the cart', async () => {
    const { gateway, service, conversation } = await readyService();
    service.updatePreferences(conversation.id, { budget: 300, diet: 'any' });
    const searches = await Promise.all([
      service.dispatch(conversation.id, 'food_search', { query: 'thali' }),
      service.dispatch(conversation.id, 'food_search', { query: 'roll' }),
      service.dispatch(conversation.id, 'food_search', { query: 'dosa' })
    ]);
    const candidateIds = searches.map(search => search.candidates[0].id);
    expect(new Set(candidateIds).size).toBe(3);
    const approval: any = await service.requestComparison(conversation.id, candidateIds);
    const completed = await service.approve(conversation.id, approval.id);

    expect(completed.approval?.status).toBe('done');
    expect(completed.quotes).toHaveLength(3);
    expect(completed.quotes.map(quote => quote.total)).toEqual(
      [...completed.quotes].map(quote => quote.total).sort((a, b) => a - b)
    );
    expect(completed.quotes.map(quote => quote.name)).toEqual(expect.arrayContaining(['Veg thali', 'Aloo roll', 'Plain dosa']));
    expect(completed.error).toBeNull();
    expect((await getMockCart(gateway)).data.items).toEqual([]);
  });

  it('prevents live cart comparisons until the staging schema has been validated', async () => {
    const liveGateway = { mode: 'live' as const, call: vi.fn(), close: vi.fn() };
    const service = new FoodService(liveGateway, idleAgent());
    const conversation = service.create();
    conversation.request.addressId = 'saved-address';
    service.updatePreferences(conversation.id, { budget: 200 });

    await expect(service.requestComparison(conversation.id, ['candidate']))
      .rejects.toThrow('Live cart comparisons are disabled until the staging cart schema is validated.');
    expect(liveGateway.call).not.toHaveBeenCalled();
  });

  it('builds a multi-item bundle with exact per-bundle and requested cart quantities', async () => {
    const { gateway, service, conversation } = await readyService();
    service.updatePreferences(conversation.id, { budget: 250, diet: 'veg', quantity: 2 });
    const search = await service.dispatch(conversation.id, 'food_search', { query: 'dosa idli' });
    const plainDosa = search.candidates.find((candidate: any) => candidate.name === 'Plain dosa');
    const idli = search.candidates.find((candidate: any) => candidate.name === 'Idli with sambar');
    expect(plainDosa).toBeDefined();
    expect(idli).toBeDefined();

    const bundleResult = await service.dispatch(conversation.id, 'food_bundle', {
      items: [
        { candidateId: plainDosa.id, quantity: 1 },
        { candidateId: idli.id, quantity: 1 }
      ]
    });
    const bundle = bundleResult.candidate;

    expect(bundle).toMatchObject({
      restaurantId: 'r3',
      price: 108,
      lines: [
        { itemId: 'i7', name: 'Plain dosa', quantity: 1 },
        { itemId: 'i8', name: 'Idli with sambar', quantity: 1 }
      ]
    });
    expect(bundleResult.note).toContain('no writes');

    const call = vi.spyOn(gateway, 'call');
    const approval: any = await service.requestComparison(conversation.id, [bundle.id]);
    expect(call.mock.calls.map(([name]) => name)).not.toContain('update_food_cart');
    const completed = await service.approve(conversation.id, approval.id);
    const quote = completed.quotes[0];

    expect(completed.approval?.status).toBe('done');
    expect(quote).toMatchObject({
      candidateId: bundle.id,
      name: bundle.name,
      quantity: 2,
      itemTotal: 216,
      delivery: 32,
      charges: 18.8,
      coupon: 'SAVE20',
      discount: 43.2,
      total: 223.6,
      withinBudget: true,
      bundle: true
    });
    expect(call.mock.calls.filter(([name]) => name === 'apply_food_coupon').map(([, args]) => args.couponCode))
      .toEqual(['SAVE20', 'FLAT40']);
    const updates = call.mock.calls.filter(([name]) => name === 'update_food_cart');
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.every(([, args]) => JSON.stringify(args.cartItems) === JSON.stringify([
      { menuItemId: 'i7', quantity: 2 },
      { menuItemId: 'i8', quantity: 2 }
    ]))).toBe(true);
    expect((await getMockCart(gateway)).data.items).toEqual([]);
  });

  it('picks the lowest payable total from all eligible non-payment coupons', async () => {
    const { gateway, service, conversation } = await readyService();
    service.updatePreferences(conversation.id, { budget: 230, diet: 'veg' });
    const search = await service.dispatch(conversation.id, 'food_search', { query: 'thali bowl' });
    const thali = search.candidates.find((candidate: any) => candidate.itemId === 'i1');
    const dalBowl = search.candidates.find((candidate: any) => candidate.itemId === 'i2');
    expect(thali?.restaurantId).toBe('r1');
    expect(dalBowl?.restaurantId).toBe('r1');

    const bundle = (await service.dispatch(conversation.id, 'food_bundle', {
      items: [
        { candidateId: thali.id, quantity: 1 },
        { candidateId: dalBowl.id, quantity: 1 }
      ]
    })).candidate;
    const approval: any = await service.requestComparison(conversation.id, [bundle.id]);
    const completed = await service.approve(conversation.id, approval.id);

    expect(completed.quotes[0]).toMatchObject({
      itemTotal: 218,
      delivery: 24,
      charges: 18.9,
      coupon: 'SAVE20',
      discount: 43.6,
      total: 217.3,
      withinBudget: true
    });
    expect(completed.error).toBeNull();
    expect((await getMockCart(gateway)).data.items).toEqual([]);
  });

  it('uses the frozen approved plan even if an observed candidate object changes later', async () => {
    const { gateway, service, conversation } = await readyService();
    service.updatePreferences(conversation.id, { budget: 200, diet: 'veg' });
    const search = await service.dispatch(conversation.id, 'food_search', { query: 'thali' });
    const candidate = search.candidates.find((option: any) => option.itemId === 'i1');
    const originalName = candidate.name;
    const approval: any = await service.requestComparison(conversation.id, [candidate.id]);
    const call = vi.spyOn(gateway, 'call');

    expect(approval.request).not.toBe(conversation.request);
    expect(approval.plans[0]).not.toBe(candidate);
    candidate.name = 'Tampered dish name';
    candidate.itemId = 'invented-id';

    const completed = await service.approve(conversation.id, approval.id);
    expect(completed.quotes[0].name).toBe(originalName);
    expect(call.mock.calls.filter(([name]) => name === 'update_food_cart').every(([, args]) =>
      JSON.stringify(args.cartItems) === JSON.stringify([{ menuItemId: 'i1', quantity: 1 }])
    )).toBe(true);
    expect((await getMockCart(gateway)).data.items).toEqual([]);
  });

  it('accepts an applicable free-delivery coupon with zero discount when payable total falls', async () => {
    class FreeDeliveryGateway extends MockFoodGateway {
      private freeDelivery = false;
      async call(name: string, args: Record<string, any>) {
        if (name === 'fetch_food_coupons') {
          return { coupon_sections: [{ coupons: [{ id: 'FREEDELIVERY', title: 'Free delivery', applicable: true }] }] };
        }
        if (name === 'apply_food_coupon' && args.couponCode === 'FREEDELIVERY') {
          this.freeDelivery = true;
          return this.asFreeDelivery(await super.call('get_food_cart', args));
        }
        if (name === 'get_food_cart') {
          const cart = await super.call(name, args);
          return this.freeDelivery ? this.asFreeDelivery(cart) : cart;
        }
        if (name === 'flush_food_cart') this.freeDelivery = false;
        return super.call(name, args);
      }
      private asFreeDelivery(raw: any) {
        const cart = structuredClone(raw);
        const data = cart.data ?? cart;
        data.pricing.to_pay -= data.pricing.delivery_charge;
        data.pricing.delivery_charge = 0;
        data.offers = { coupon_applied: 'FREEDELIVERY', coupon_discount: 0 };
        return cart;
      }
    }

    const gateway = new FreeDeliveryGateway();
    const service = new FoodService(gateway, idleAgent());
    const conversation = service.create();
    await service.selectAddress(conversation.id, 'mock-home');
    service.updatePreferences(conversation.id, { budget: 150, diet: 'veg' });
    const search = await service.dispatch(conversation.id, 'food_search', { query: 'thali' });
    const approval: any = await service.requestComparison(conversation.id, [search.candidates[0].id]);
    const completed = await service.approve(conversation.id, approval.id);

    expect(completed.quotes[0]).toMatchObject({
      name: 'Veg thali',
      itemTotal: 129,
      delivery: 0,
      coupon: 'FREEDELIVERY',
      discount: 0,
      total: 143.45,
      withinBudget: true,
      bundle: false
    });
    expect(completed.error).toBeNull();
    expect((await gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items).toEqual([]);
  });

  it('rejects mixed restaurants, invented or nested bundles, overlong bundle lists, and excess multiplied quantity', async () => {
    const { service, conversation } = await readyService();
    service.updatePreferences(conversation.id, { budget: 500, diet: 'any', quantity: 3 });
    const [dosaSearch, thaliSearch, pizzaSearch] = await Promise.all([
      service.dispatch(conversation.id, 'food_search', { query: 'dosa' }),
      service.dispatch(conversation.id, 'food_search', { query: 'thali' }),
      service.dispatch(conversation.id, 'food_search', { query: 'pizza' })
    ]);
    const plainDosa = dosaSearch.candidates.find((candidate: any) => candidate.itemId === 'i7');
    const thali = thaliSearch.candidates.find((candidate: any) => candidate.itemId === 'i1');
    const customPizza = pizzaSearch.candidates.find((candidate: any) => candidate.itemId === 'i14');

    await expect(service.dispatch(conversation.id, 'food_bundle', {
      items: [
        { candidateId: plainDosa.id, quantity: 1 },
        { candidateId: thali.id, quantity: 1 }
      ]
    })).rejects.toThrow('Combine available simple observed dishes from one restaurant only.');
    await expect(service.dispatch(conversation.id, 'food_bundle', {
      items: [{ candidateId: 'invented-option', quantity: 1 }]
    })).rejects.toThrow('Unknown candidate.');
    await expect(service.dispatch(conversation.id, 'food_bundle', {
      items: [{ candidateId: customPizza.id, quantity: 1 }]
    })).rejects.toThrow('Combine available simple observed dishes from one restaurant only.');
    await expect(service.dispatch(conversation.id, 'food_bundle', {
      items: Array.from({ length: 6 }, () => ({ candidateId: plainDosa.id, quantity: 1 }))
    })).rejects.toThrow();
    await expect(service.dispatch(conversation.id, 'food_bundle', {
      items: [{ candidateId: plainDosa.id, quantity: 4 }]
    })).rejects.toThrow('Each dish quantity must stay within 10 after multiplying by requested bundles.');

    const validBundle = (await service.dispatch(conversation.id, 'food_bundle', {
      items: [{ candidateId: plainDosa.id, quantity: 1 }]
    })).candidate;
    await expect(service.dispatch(conversation.id, 'food_bundle', {
      items: [{ candidateId: validBundle.id, quantity: 1 }]
    })).rejects.toThrow('Combine available simple observed dishes from one restaurant only.');
  });

  it('labels above-listed-budget search and bundle options as hypotheses, then checks delivered budget separately', async () => {
    const { service, conversation } = await readyService();
    service.updatePreferences(conversation.id, { budget: 100, diet: 'veg' });

    const ordinary = await service.dispatch(conversation.id, 'food_search', { query: 'pizza' });
    expect(ordinary.candidates.some((candidate: any) => candidate.itemId === 'i13')).toBe(false);
    const dealSearch = await service.dispatch(conversation.id, 'food_search', {
      query: 'pizza', includePotentialDeals: true
    });
    const pizza = dealSearch.candidates.find((candidate: any) => candidate.itemId === 'i13');
    expect(pizza).toMatchObject({ price: 159, dealHypothesis: true });
    await expect(service.dispatch(conversation.id, 'food_bundle', {
      items: [{ candidateId: pizza.id, quantity: 1 }]
    })).rejects.toThrow('Bundle subtotal exceeds budget.');

    const bundle = (await service.dispatch(conversation.id, 'food_bundle', {
      items: [{ candidateId: pizza.id, quantity: 1 }], includePotentialDeals: true
    })).candidate;
    expect(bundle).toMatchObject({ price: 159, dealHypothesis: true });
    const approval: any = await service.requestComparison(conversation.id, [bundle.id]);
    const completed = await service.approve(conversation.id, approval.id);
    expect(completed.quotes[0].withinBudget).toBe(false);
    expect(completed.quotes[0].total).toBeGreaterThan(100);
  });

  it('saves directives before address selection, shares them across web and Telegram conversations, and forgets them', async () => {
    const service = new FoodService(new MockFoodGateway(), idleAgent());
    const telegram = service.create('telegram');
    const saved = await service.dispatch(telegram.id, 'food_remember', {
      text: 'Avoid peanuts in every meal.', source: 'user'
    });
    expect(telegram.request.addressId).toBeNull();
    expect(saved.source).toBe('user');

    const web = service.create('web');
    const context = await service.dispatch(web.id, 'food_context', {});
    expect(web.request.addressId).toBeNull();
    expect(context.directives).toContainEqual(saved);

    expect(await service.dispatch(web.id, 'food_forget', { directiveId: saved.id }))
      .toEqual({ removed: true });
    expect((await service.dispatch(telegram.id, 'food_context', {})).directives).toEqual([]);
  });

  it('removes an idle conversation and forgets the matching agent thread', async () => {
    const forget = vi.fn(async () => {});
    const agent: AgentProvider = { ...idleAgent(), forget };
    const service = new FoodService(new MockFoodGateway(), agent);
    const conversation = service.create();

    service.remove(conversation.id);
    await Promise.resolve();

    expect(service.conversations.has(conversation.id)).toBe(false);
    expect(forget).toHaveBeenCalledWith(conversation.id);
    expect(() => service.snapshot(conversation.id)).toThrow('Conversation expired. Start a new chat.');
  });

  it('does not remove a conversation while its agent turn is still active', async () => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const agent: AgentProvider = {
      ...idleAgent(),
      async turn() { await waiting; return 'finished'; }
    };
    const service = new FoodService(new MockFoodGateway(), agent);
    const conversation = service.create();
    const pending = service.chat(conversation.id, 'hello');

    expect(conversation.busy).toBe(true);
    expect(() => service.remove(conversation.id)).toThrow('Stop the current operation before starting fresh.');
    release();
    await pending;
    expect(service.conversations.has(conversation.id)).toBe(true);
  });
});
