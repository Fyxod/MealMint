import { describe, expect, it, vi } from 'vitest';
import { FoodService } from '../src/service.js';
import { SwiggyResponseError } from '../src/food.js';
import { cartFingerprint, cartReceiptFingerprint } from '../src/cart.js';
import type { AgentProvider, Candidate, FoodGateway } from '../src/types.js';

// All catalogue, address, pricing and coupon values in this gateway are synthetic.
class SyntheticCustomizationGateway implements FoodGateway {
  readonly mode = 'mock' as const;
  calls: { name: string; args: any }[] = [];
  items: any[] = [];
  coupon: string | null = null;
  invalidAddonForVariant = false;
  substituteAddon = false;
  substituteVariant = false;
  numericIdentity = false;
  outOfStock = false;
  choiceDiet: boolean | null = true;
  constructor(readonly legacy = false) {}
  async close() {}
  catalogue() {
    const choices = [{ id: 'small', name: 'Small', price: 100, inStock: 1, isVeg: true }, { id: 'large', name: 'Large', price: 140, inStock: 1, isVeg: true }];
    return [
      { menu_item_id: 'custom', restaurantId: 'synthetic-r', name: 'Synthetic customizable burger', price: 100, isVeg: true, inStock: 1, hasVariants: true, hasAddons: true,
        ...(this.legacy ? { variations: choices.map(x => ({ ...x, groupId: 'size', groupName: 'Size' })) } : { variantsV2: [{ groupId: 'size', name: 'Size', variations: choices }] }),
        addons: this.validAddons(),
      },
      { menu_item_id: this.numericIdentity ? 123 : 'regular', restaurantId: 'synthetic-r', name: 'Synthetic regular burger', price: 70, isVeg: true, inStock: 1 },
      { menu_item_id: 'discounted', restaurantId: 'synthetic-r', name: 'Synthetic discounted burger', price: 59, isVeg: true, inStock: 1 },
    ];
  }
  validAddons() {
    return [{ groupId: 'extras', groupName: 'Extras', minAddons: 0, maxAddons: 1, choices: [{ id: 'cheese', name: 'Cheese', price: 10, ...(this.choiceDiet === null ? {} : { isVeg: this.choiceDiet }) }, { id: 'sauce', name: 'Sauce', price: 5, isVeg: true }] }];
  }
  cart() {
    const item_total = this.items.reduce((sum, x) => sum + x.total, 0);
    const discount = this.coupon === 'THRESHOLD80' && item_total >= 200 && this.items.every(x => x.menu_item_id === 'regular') ? 80 : 0;
    return { addressId: 'synthetic-home', data: {
      restaurant: this.items.length ? { id: 'synthetic-r', name: 'Synthetic kitchen' } : null,
      items: structuredClone(this.items),
      pricing: { item_total, delivery_charge: this.items.length ? 20 : 0, taxes_and_charges: 0, to_pay: item_total + (this.items.length ? 20 : 0) - discount },
      offers: { coupon_applied: this.coupon, coupon_discount: discount },
    } };
  }
  async call(name: string, args: Record<string, any>): Promise<any> {
    this.calls.push({ name, args: structuredClone(args) });
    if (name === 'get_addresses') return [{ id: 'synthetic-home', label: 'Synthetic home', display: 'Synthetic district' }];
    if (name === 'search_restaurants') return { restaurants: [{ id: 'synthetic-r', name: 'Synthetic kitchen', availabilityStatus: 'OPEN', deliveryTimeMinutes: 20 }], dishes: this.catalogue() };
    if (name === 'search_menu') return { items: this.catalogue() };
    if (name === 'get_food_cart') return this.cart();
    if (name === 'flush_food_cart') { this.items = []; this.coupon = null; return { success: true }; }
    if (name === 'update_food_cart') {
      this.items = args.cartItems.map((line: any) => {
        const id = line.menuItemId ?? line.menu_item_id;
        const variants = structuredClone(line.variants ?? line.variantsV2 ?? []);
        if (this.substituteVariant && variants.length) variants[0].variation_id = 'large';
        const addons = structuredClone(line.addons ?? []);
        if (this.substituteAddon && addons.length) addons[0].choice_id = 'sauce';
        const unit = id === 'custom' ? (variants[0]?.variation_id === 'large' ? 140 : 100) + (addons.some((x: any) => x.choice_id === 'cheese') ? 10 : 0) : (id === 'regular' || id === '123') ? 70 : 59;
        const valid_addons = this.validAddons();
        if (this.invalidAddonForVariant) valid_addons[0].choices = [{ id: 'sauce', name: 'Sauce', price: 5 }];
        return { menu_item_id: this.numericIdentity && id === '123' ? 123 : id, quantity: line.quantity, in_stock: this.outOfStock ? 0 : true, variants, addons, valid_addons, total: unit * line.quantity };
      });
      return this.cart();
    }
    if (name === 'fetch_food_coupons') return { coupon_sections: [{ coupons: [{ id: 'THRESHOLD80', applicable: this.items.length > 0 && this.items.every(x => x.menu_item_id === 'regular') && this.cart().data.pricing.item_total >= 200, title: 'Synthetic 80 off at 200' }] }] };
    if (name === 'apply_food_coupon') { this.coupon = args.couponCode; return this.cart(); }
    throw new Error(`Unexpected synthetic gateway call: ${name}`);
  }
}
const idleAgent: AgentProvider = {
  async status() { return { connected: true, provider: 'synthetic-test' }; },
  async turn() { return 'Synthetic test'; }, async cancel() {}, async close() {},
};
async function setup(legacy = false, agent: AgentProvider = idleAgent) {
  const gateway = new SyntheticCustomizationGateway(legacy);
  const service = new FoodService(gateway, agent);
  const c = service.create();
  await service.selectAddress(c.id, 'synthetic-home');
  service.updatePreferences(c.id, { budget: 300 });
  const search = await service.dispatch(c.id, 'food_search', { query: 'burger' });
  const base = search.candidates.find((x: Candidate) => x.itemId === 'custom');
  return { gateway, service, c, base, candidates: search.candidates as Candidate[] };
}
async function configure(service: FoodService, id: string, candidateId: string, variant = 'small', cheese = true) {
  await service.customizationOptions(id, candidateId);
  return service.configure(id, candidateId, { variants: [{ groupId: 'size', choiceId: variant }], addons: cheese ? [{ groupId: 'extras', choiceId: 'cheese' }] : [] });
}

describe('FoodService synthetic customization and coupon regressions', () => {
  it('requires fresh observed choices, retains unknown selected price and never writes during configuration', async () => {
    const { service, gateway, c, base } = await setup();
    expect(() => service.configure(c.id, base.id, { variants: [], addons: [] })).toThrow(/expired/);
    await expect(service.customizationOptions(c.id, 'invented')).rejects.toThrow();
    const configured = await configure(service, c.id, base.id);
    expect(configured).toMatchObject({ itemId: 'custom', price: null, customizable: false, originalName: base.name });
    expect(gateway.calls.some(x => /update_food_cart|flush_food_cart|apply_food_coupon/.test(x.name))).toBe(false);
    const shown = await service.dispatch(c.id, 'food_present', { candidateIds: [configured.id] });
    expect(shown.shown[0].price).toBeNull();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001);
    try { expect(() => service.configure(c.id, configured.id, { variants: [], addons: [] })).toThrow(/expired/); }
    finally { clock.mockRestore(); }
  });

  it.each([false, true])('stages variants before validating and adding extras, then verifies totals and clears the cart (legacy=%s)', async legacy => {
    const { service, gateway, c, base } = await setup(legacy);
    const configured = await configure(service, c.id, base.id);
    const approval = await service.requestComparison(c.id, [configured.id]);
    expect(gateway.items).toEqual([]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.approval?.status).toBe('done');
    expect(result.quotes[0]).toMatchObject({ itemTotal: 110, total: 130, withinBudget: true });
    const updates = gateway.calls.filter(x => x.name === 'update_food_cart');
    expect(updates).toHaveLength(2);
    expect(updates[0].args.cartItems[0]).toEqual({ menuItemId: 'custom', quantity: 1, [legacy ? 'variants' : 'variantsV2']: [{ group_id: 'size', variation_id: 'small' }] });
    expect(updates[1].args.cartItems[0].addons).toEqual([{ group_id: 'extras', choice_id: 'cheese' }]);
    const firstWrite = gateway.calls.indexOf(updates[0]), secondWrite = gateway.calls.indexOf(updates[1]);
    expect(gateway.calls.slice(firstWrite + 1, secondWrite).some(x => x.name === 'get_food_cart')).toBe(true);
    expect(gateway.items).toEqual([]);
  });

  it('rejects add-ons absent from the fresh variant cart and safely clears its first-stage write', async () => {
    const { service, gateway, c, base } = await setup();
    const configured = await configure(service, c.id, base.id);
    gateway.invalidAddonForVariant = true;
    const approval = await service.requestComparison(c.id, [configured.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toMatch(/unavailable/);
    expect(result.error).not.toMatch(/could not be safely cleared/);
    expect(result.quotes).toEqual([]);
    expect(gateway.calls.filter(x => x.name === 'update_food_cart')).toHaveLength(1);
    expect(gateway.items).toEqual([]);
  });

  it.each(['substituteVariant', 'substituteAddon'] as const)('rejects a gateway that silently substitutes %s and cleans up without reporting a verified quote', async substitution => {
    const { service, gateway, c, base } = await setup();
    const configured = await configure(service, c.id, base.id);
    gateway[substitution] = true;
    const approval = await service.requestComparison(c.id, [configured.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toMatch(/does not match|do not match/);
    expect(result.error).not.toMatch(/could not be safely cleared/);
    expect(result.quotes).toEqual([]);
    expect(gateway.items).toEqual([]);
  });

  it('keeps different configurations of one SKU as separate lines while merging duplicate configurations', async () => {
    const { service, gateway, c, base } = await setup();
    service.updatePreferences(c.id, { budget: 1000 });
    await service.dispatch(c.id, 'food_search', { query: 'burger' });
    const small = await configure(service, c.id, base.id, 'small');
    const large = await configure(service, c.id, base.id, 'large', false);
    expect(small.id).not.toBe(large.id);
    const { candidate: bundle } = await service.dispatch(c.id, 'food_bundle', { items: [
      { candidateId: small.id, quantity: 1 }, { candidateId: large.id, quantity: 1 }, { candidateId: small.id, quantity: 1 },
    ] });
    expect(bundle.price).toBeNull();
    expect(bundle.lines).toHaveLength(2);
    expect(bundle.lines.map((x: any) => x.quantity).sort()).toEqual([1, 2]);
    const approval = await service.requestComparison(c.id, [bundle.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.quotes[0]).toMatchObject({ itemTotal: 360, total: 380, bundle: true });
    expect(gateway.items).toEqual([]);
  });

  it('keeps an expensive customization unverified until approval and reports it outside budget afterward', async () => {
    const { service, gateway, c, base } = await setup();
    service.updatePreferences(c.id, { budget: 120 });
    await service.dispatch(c.id, 'food_search', { query: 'burger' });
    const configured = await configure(service, c.id, base.id, 'large');
    expect(configured.price).toBeNull();
    const approval = await service.requestComparison(c.id, [configured.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.quotes[0]).toMatchObject({ itemTotal: 150, total: 170, withinBudget: false });
    expect(gateway.items).toEqual([]);
  });

  it('rejects invalid configuration without changing a pending approval or writing the cart', async () => {
    const { service, gateway, c, base } = await setup();
    const configured = await configure(service, c.id, base.id);
    const approval = await service.requestComparison(c.id, [configured.id]);
    expect(() => service.configure(c.id, configured.id, { variants: [{ groupId: 'size', choiceId: 'invented' }], addons: [] })).toThrow(/unavailable/);
    expect(c.approval).toBe(approval);
    expect(approval.status).toBe('pending');
    expect(c.candidates[0].id).toBe(configured.id);
    expect(gateway.calls.some(x => /update_food_cart|flush_food_cart|apply_food_coupon/.test(x.name))).toBe(false);
  });

  it('rejects unconfigured dishes before both bundle creation and price comparison', async () => {
    const { service, gateway, c, base } = await setup();
    await expect(service.requestComparison(c.id, [base.id])).rejects.toThrow(/required variants/);
    await expect(service.dispatch(c.id, 'food_bundle', { items: [{ candidateId: base.id, quantity: 1 }] })).rejects.toThrow(/Configure required choices/);
    expect(gateway.items).toEqual([]);
  });

  it.each([false, null, true])('preserves selected add-on dietary evidence (%s) instead of inheriting only the base dish', async choiceDiet => {
    const { service, gateway, c, base } = await setup();
    gateway.choiceDiet = choiceDiet;
    service.updatePreferences(c.id, { diet: 'veg' });
    await service.dispatch(c.id, 'food_search', { query: 'burger' });
    const configured = await configure(service, c.id, base.id);
    expect(configured.isVeg).toBe(choiceDiet);
    if (choiceDiet === true) {
      const approval = await service.requestComparison(c.id, [configured.id]);
      expect(approval.status).toBe('pending');
    } else {
      await expect(service.requestComparison(c.id, [configured.id])).rejects.toThrow(/no longer matches/);
    }
    expect(gateway.items).toEqual([]);
  });

  it.each([false, null])('re-evaluates diet from the original base when removing a %s dietary addon', async choiceDiet => {
    const { service, gateway, c, base } = await setup();
    gateway.choiceDiet = choiceDiet;
    const withAddon = await configure(service, c.id, base.id);
    expect(withAddon.isVeg).toBe(choiceDiet);
    const withoutAddon = await configure(service, c.id, withAddon.id, 'small', false);
    expect(withoutAddon.isVeg).toBe(true);
  });

  it('accepts numeric live-style menu identifiers by their exact string identity', async () => {
    const { service, gateway, c } = await setup();
    gateway.numericIdentity = true;
    const search = await service.dispatch(c.id, 'food_search', { query: 'burger' });
    const numericCandidate = search.candidates.find((x: Candidate) => x.itemId === '123');
    const approval = await service.requestComparison(c.id, [numericCandidate.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.quotes[0]).toMatchObject({ itemTotal: 70, total: 90 });
    expect(gateway.items).toEqual([]);
  });

  it('rejects a cart item that becomes unavailable with numeric in_stock=0', async () => {
    const { service, gateway, c, candidates } = await setup();
    gateway.outOfStock = true;
    const regular = candidates.find(x => x.itemId === 'regular')!;
    const approval = await service.requestComparison(c.id, [regular.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('no longer available');
    expect(result.quotes).toEqual([]);
    expect(gateway.items).toEqual([]);
  });

  it('invalidates an existing approval when a configuration is edited', async () => {
    const { service, c, base, gateway } = await setup();
    const configured = await configure(service, c.id, base.id);
    const approval = await service.requestComparison(c.id, [configured.id]);
    await configure(service, c.id, configured.id, 'large');
    expect(approval.status).toBe('cancelled');
    await expect(service.approve(c.id, approval.id)).rejects.toThrow(/already used/);
    expect(gateway.items).toEqual([]);
  });

  it('compares observed higher-price qualifying quantities against a cheaper discounted SKU using delivered totals', async () => {
    const { service, gateway, c, candidates } = await setup();
    service.updatePreferences(c.id, { budget: 200 });
    await service.dispatch(c.id, 'food_search', { query: 'burger' });
    const regular = candidates.find(x => x.itemId === 'regular')!;
    const discounted = candidates.find(x => x.itemId === 'discounted')!;
    const regularBundle = await service.dispatch(c.id, 'food_bundle', { items: [{ candidateId: regular.id, quantity: 3 }], includePotentialDeals: true });
    const discountedBundle = await service.dispatch(c.id, 'food_bundle', { items: [{ candidateId: discounted.id, quantity: 3 }] });
    expect(regularBundle.candidate.price).toBe(210);
    expect(discountedBundle.candidate.price).toBe(177);
    expect(gateway.items).toEqual([]);
    const approval = await service.requestComparison(c.id, [discountedBundle.candidate.id, regularBundle.candidate.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.quotes).toHaveLength(2);
    expect(result.quotes[0]).toMatchObject({ candidateId: regularBundle.candidate.id, itemTotal: 210, discount: 80, coupon: 'THRESHOLD80', total: 150, withinBudget: true });
    expect(result.quotes[1]).toMatchObject({ candidateId: discountedBundle.candidate.id, itemTotal: 177, discount: 0, coupon: null, total: 197 });
    expect(gateway.calls.filter(x => x.name === 'apply_food_coupon')).toHaveLength(1);
    expect(gateway.items).toEqual([]);
  });
});


class FixedVariantGateway extends SyntheticCustomizationGateway {
  failure: 'addon' | 'transport' | 'unavailable' | 'untyped' = 'addon';
  acceptSeed: string | null = 'seed-b';
  mutateBeforeFailure = false;
  appendForeignAddon = false;
  override catalogue() {
    const items = super.catalogue();
    const custom: any = items[0];
    custom.addons.push(...['a', 'b'].map(suffix => ({ groupId: `fixed-${suffix}`, groupName: 'Fixed choice', minAddons: 1, maxAddons: 1,
      choices: [{ id: `seed-${suffix}`, name: `Selected synthetic ${suffix}`, price: 0, inStock: 1, isVeg: true }] })));
    return items;
  }
  override async call(name: string, args: Record<string, any>): Promise<any> {
    if (name === 'update_food_cart' && !args.cartItems[0]?.addons?.some((x: any) => x.choice_id === this.acceptSeed)) {
      this.calls.push({ name, args: structuredClone(args) });
      if (this.mutateBeforeFailure) this.items = [{ menu_item_id: 'external', quantity: 1, total: 60, in_stock: true }];
      if (this.failure === 'transport') throw new Error('Synthetic transport lost response');
      if (this.failure === 'unavailable') throw new SwiggyResponseError('UNAVAILABLE');
      if (this.failure === 'untyped') throw new Error('INVALID_ADDON');
      throw new SwiggyResponseError('INVALID_ADDON');
    }
    const result = await super.call(name, args);
    if (name === 'update_food_cart' && this.appendForeignAddon) {
      this.items[0].addons.push({ group_id: 'unapproved', choice_id: 'extra' });
      return this.cart();
    }
    return result;
  }
}
async function fixedSetup() {
  const gateway = new FixedVariantGateway();
  const service = new FoodService(gateway, idleAgent);
  const c = service.create();
  await service.selectAddress(c.id, 'synthetic-home');
  service.updatePreferences(c.id, { budget: 300 });
  const search = await service.dispatch(c.id, 'food_search', { query: 'burger' });
  const base = search.candidates.find((x: Candidate) => x.itemId === 'custom');
  const configured = await configure(service, c.id, base.id, 'small', false);
  return { gateway, service, c, configured };
}

describe('FoodService synthetic fixed-choice retries', () => {
  it('tries distinct approved fixed alternatives after typed rejection and verifies the successful required seed', async () => {
    const { gateway, service, c, configured } = await fixedSetup();
    const approval = await service.requestComparison(c.id, [configured.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.quotes[0]).toMatchObject({ itemTotal: 100, total: 120 });
    const writes = gateway.calls.filter(x => x.name === 'update_food_cart');
    expect(writes).toHaveLength(3);
    expect(writes.map(x => x.args.cartItems[0].addons ?? [])).toEqual([
      [], [{ group_id: 'fixed-a', choice_id: 'seed-a' }], [{ group_id: 'fixed-b', choice_id: 'seed-b' }],
    ]);
    for (let i = 1; i < writes.length; i++) {
      expect(gateway.calls.slice(gateway.calls.indexOf(writes[i - 1]) + 1, gateway.calls.indexOf(writes[i])).some(x => x.name === 'get_food_cart')).toBe(true);
    }
    expect(gateway.items).toEqual([]);
  });

  it.each(['transport', 'unavailable', 'untyped'] as const)('never retries a %s failure as a fixed-choice rejection', async failure => {
    const { gateway, service, c, configured } = await fixedSetup();
    gateway.failure = failure;
    const approval = await service.requestComparison(c.id, [configured.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).not.toBeNull();
    expect(result.quotes).toEqual([]);
    expect(gateway.calls.filter(x => x.name === 'update_food_cart')).toHaveLength(1);
    expect(gateway.items).toEqual([]);
  });

  it('stops after every approved seed is rejected and clears the empty comparison safely', async () => {
    const { gateway, service, c, configured } = await fixedSetup();
    gateway.acceptSeed = null;
    const approval = await service.requestComparison(c.id, [configured.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toMatch(/additional choices/);
    expect(result.error).not.toMatch(/could not be safely cleared/);
    expect(result.quotes).toEqual([]);
    expect(gateway.calls.filter(x => x.name === 'update_food_cart')).toHaveLength(3);
    expect(gateway.calls.at(-1)?.name).toBe('flush_food_cart');
    expect(gateway.items).toEqual([]);
  });

  it('does not retry or overwrite a nonempty cart after a rejected seed write', async () => {
    const { gateway, service, c, configured } = await fixedSetup();
    gateway.mutateBeforeFailure = true;
    const approval = await service.requestComparison(c.id, [configured.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toMatch(/Cart changed during fixed-choice validation/);
    expect(result.error).toMatch(/could not be safely cleared/);
    expect(result.quotes).toEqual([]);
    expect(gateway.calls.filter(x => x.name === 'update_food_cart')).toHaveLength(1);
    expect(gateway.items[0].menu_item_id).toBe('external');
    expect(gateway.calls.filter(x => x.name === 'flush_food_cart')).toHaveLength(1);
  });

  it('rejects unrelated add-ons even after an approved structural seed succeeds', async () => {
    const { gateway, service, c, configured } = await fixedSetup();
    gateway.appendForeignAddon = true;
    const approval = await service.requestComparison(c.id, [configured.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toMatch(/do not match/);
    expect(result.quotes).toEqual([]);
    expect(gateway.items).toEqual([]);
  });


});


function cancellableSyntheticAgent() {
  let rejectTurn!: (reason: Error) => void;
  let announceStarted!: () => void;
  const started = new Promise<void>(resolve => { announceStarted = resolve; });
  const agent: AgentProvider = {
    ...idleAgent,
    async turn() {
      return await new Promise<string>((_resolve, reject) => {
        rejectTurn = reject;
        announceStarted();
      });
    },
    async cancel() { rejectTurn(new Error('Synthetic agent turn cancelled')); },
  };
  return { agent, started };
}

describe('FoodService cancellation and customization recovery', () => {
  it('treats a cancelled agent turn as a normal completed stop without error state or error events', async () => {
    const { agent, started } = cancellableSyntheticAgent();
    const { service, c } = await setup(false, agent);
    const events: any[] = [];
    service.on('event', event => events.push(event));
    const chat = service.chat(c.id, 'Synthetic search to stop');
    await started;
    expect(c.busy).toBe(true);
    await service.cancel(c.id);
    const result = await chat;
    expect(result).toMatchObject({ busy: false, error: null, status: 'Ready' });
    expect(events.filter(event => event.type === 'error')).toEqual([]);
    expect(result.messages.filter(message => message.role === 'assistant')).toEqual([]);
    expect(result.messages.at(-1)?.text).toBe('Synthetic search to stop');
  });

  it('leaves an idle cancellation Ready and invalidates its pending comparison', async () => {
    const { service, c, base, gateway } = await setup();
    const configured = await configure(service, c.id, base.id);
    const approval = await service.requestComparison(c.id, [configured.id]);
    const events: any[] = [];
    service.on('event', event => events.push(event));
    await service.cancel(c.id);
    expect(c).toMatchObject({ busy: false, error: null, status: 'Ready' });
    expect(approval.status).toBe('cancelled');
    expect(events.filter(event => event.type === 'error')).toEqual([]);
    expect(gateway.calls.some(x => /update_food_cart|flush_food_cart|apply_food_coupon/.test(x.name))).toBe(false);
  });

  it('allows manual choice loading and editing after a completed chat cancellation', async () => {
    const { agent, started } = cancellableSyntheticAgent();
    const { service, c, base, gateway } = await setup(false, agent);
    const chat = service.chat(c.id, 'Synthetic search to stop before editing');
    await started;
    await service.cancel(c.id);
    await chat;
    const options = await service.customizationOptions(c.id, base.id);
    expect(options.details.variants[0].id).toBe('size');
    const configured = service.configure(c.id, base.id, { variants: [{ groupId: 'size', choiceId: 'large' }], addons: [] });
    expect(configured.selection?.variants).toEqual([{ groupId: 'size', choiceId: 'large' }]);
    expect(c).toMatchObject({ busy: false, error: null, status: 'Ready' });
    expect(gateway.calls.some(x => /update_food_cart|flush_food_cart|apply_food_coupon/.test(x.name))).toBe(false);
  });

  it('clears a failed comparison when a valid corrected configuration is saved', async () => {
    const { service, c, base, gateway } = await setup();
    const configured = await configure(service, c.id, base.id);
    gateway.invalidAddonForVariant = true;
    const approval = await service.requestComparison(c.id, [configured.id]);
    await service.approve(c.id, approval.id);
    expect(c.error).toMatch(/unavailable/);
    expect(c.status).toBe('Needs attention');
    const writesBeforeEdit = gateway.calls.filter(x => x.name === 'update_food_cart').length;
    const corrected = await configure(service, c.id, configured.id, 'small', false);
    expect(corrected.selection?.addons).toEqual([]);
    expect(c).toMatchObject({ busy: false, error: null, status: 'Ready', quotes: [] });
    expect(gateway.calls.filter(x => x.name === 'update_food_cart')).toHaveLength(writesBeforeEdit);
    expect(gateway.items).toEqual([]);
  });

  it('does not dismiss a genuine failure merely because an invalid edit was attempted', async () => {
    const { service, c, base, gateway } = await setup();
    const configured = await configure(service, c.id, base.id);
    gateway.invalidAddonForVariant = true;
    const approval = await service.requestComparison(c.id, [configured.id]);
    await service.approve(c.id, approval.id);
    const originalError = c.error;
    expect(originalError).toMatch(/unavailable/);
    expect(() => service.configure(c.id, configured.id, { variants: [{ groupId: 'size', choiceId: 'invented' }], addons: [] })).toThrow(/unavailable/);
    expect(c.error).toBe(originalError);
    expect(c.status).toBe('Needs attention');
    expect(gateway.items).toEqual([]);
  });
});

describe('FoodService incomplete comparison evidence', () => {
  async function partialSetup() {
    const state = await setup();
    const original = state.gateway.call.bind(state.gateway);
    const regular = state.candidates.find(x => x.itemId === 'regular')!;
    const discounted = state.candidates.find(x => x.itemId === 'discounted')!;
    state.gateway.call = async (name, args) => {
      if (name === 'update_food_cart' && args.cartItems?.[0]?.menuItemId === 'discounted')
        throw new SwiggyResponseError('UNAVAILABLE');
      return original(name, args);
    };
    const approval = await state.service.requestComparison(state.c.id, [regular.id, discounted.id]);
    await state.service.approve(state.c.id, approval.id);
    return { ...state, regular, original };
  }

  it('records requested/checked counts and issues, retaining only verified configurations after a later failure', async () => {
    const { c, gateway } = await partialSetup();
    expect(c.comparison).toEqual({ requested: 2, checked: 1, cancelled: false, issues: ['This food is no longer available. Search again.'] });
    expect(c.quotes).toHaveLength(1);
    expect(c.quotes[0].itemTotal).toBe(70);
    expect(c.messages.at(-1)).toMatchObject({ role: 'assistant', text: expect.stringContaining('Comparison incomplete: 1 of 2 selected options were checked.') });
    expect(c.messages.at(-1)?.text).toContain('Results apply only to successfully checked configurations.');
    expect(gateway.items).toEqual([]);
  });

  it('preserves incomplete evidence in agent context after a later chat clears the transient error', async () => {
    const { service, c } = await partialSetup();
    const comparison = structuredClone(c.comparison);
    expect(c.error).not.toBeNull();
    await service.chat(c.id, 'Explain the options that actually completed.');
    expect(c.error).toBeNull();
    const context = await service.dispatch(c.id, 'food_context', {});
    expect(context.lastComparison).toEqual(comparison);
    expect(context.quotes).toHaveLength(1);
  });

  it('replaces the previous incomplete record when a new approved comparison succeeds', async () => {
    const { service, c, gateway, original, regular } = await partialSetup();
    gateway.call = original;
    const approval = await service.requestComparison(c.id, [regular.id]);
    await service.approve(c.id, approval.id);
    expect(c.error).toBeNull();
    expect(c.comparison).toEqual({ requested: 1, checked: 1, issues: [], cancelled: false });
    expect((await service.dispatch(c.id, 'food_context', {})).lastComparison).toEqual(c.comparison);
  });

  it('distinguishes an owner stop from a failed configuration without inventing checked results', async () => {
    const { service, c, candidates, gateway } = await setup();
    const regular = candidates.find(x => x.itemId === 'regular')!;
    const discounted = candidates.find(x => x.itemId === 'discounted')!;
    const approval = await service.requestComparison(c.id, [regular.id, discounted.id]);
    let cancellation: Promise<void> | undefined;
    service.on('event', () => {
      if (!cancellation && c.comparison?.checked === 1 && c.busy) cancellation = service.cancel(c.id);
    });
    await service.approve(c.id, approval.id);
    await cancellation;
    expect(c.comparison).toEqual({ requested: 2, checked: 1, issues: [], cancelled: true });
    expect(gateway.calls.some(call => call.name === 'fetch_food_coupons' || call.name === 'apply_food_coupon')).toBe(false);
    expect(c.approval?.status).toBe('cancelled');
    expect(c.error).toBeNull();
    expect(c.quotes).toHaveLength(1);
    expect(gateway.items).toEqual([]);
  });
});


// Two distinct observed dishes with independent fixed-item alternatives.
class MixedFixedGateway extends SyntheticCustomizationGateway {
  attempts = 0;
  rejectAll = false;
  transportAt: number | null = null;
  readonly seedCount = 3;
  override catalogue() {
    const first: any = super.catalogue()[0];
    const items = [first, { ...structuredClone(first), menu_item_id: 'custom-second', name: 'Synthetic second burger' }];
    return items.map((item, index) => ({ ...item, addons: [...item.addons,
      ...Array.from({ length: this.seedCount }, (_, choice) => ({ groupId: `fixed-${index}-${choice}`, groupName: 'Fixed item', minAddons: 1, maxAddons: 1,
        choices: [{ id: `seed-${index}-${choice}`, name: `Selected synthetic item ${index}`, price: 0, inStock: 1, isVeg: true }] })),
    ] }));
  }
  override async call(name: string, args: Record<string, any>): Promise<any> {
    if (name !== 'update_food_cart') return super.call(name, args);
    this.attempts++;
    const correct = args.cartItems.every((line: any) => {
      const index = line.menuItemId === 'custom' ? 0 : 1;
      const required = index === 0 ? 1 : 2;
      return line.addons?.some((addon: any) => addon.group_id === `fixed-${index}-${required}` && addon.choice_id === `seed-${index}-${required}`);
    });
    if (this.transportAt === this.attempts || this.rejectAll || !correct) {
      this.calls.push({ name, args: structuredClone(args) });
      if (this.transportAt === this.attempts) throw new Error('Synthetic uncertain transport error');
      throw new SwiggyResponseError('INVALID_ADDON');
    }
    await super.call(name, args);
    for (const line of this.items) line.total = (line.menu_item_id === 'custom' ? 100 : 140) * line.quantity;
    return this.cart();
  }
}
async function mixedFixedSetup() {
  const gateway = new MixedFixedGateway();
  const service = new FoodService(gateway, idleAgent);
  const c = service.create();
  await service.selectAddress(c.id, 'synthetic-home');
  service.updatePreferences(c.id, { budget: 2000, quantity: 2 });
  const { candidates } = await service.dispatch(c.id, 'food_search', { query: 'burger' });
  const first = await configure(service, c.id, candidates.find((x: Candidate) => x.itemId === 'custom').id, 'small', false);
  const second = await configure(service, c.id, candidates.find((x: Candidate) => x.itemId === 'custom-second').id, 'large', false);
  const { candidate: bundle } = await service.dispatch(c.id, 'food_bundle', { items: [
    { candidateId: first.id, quantity: 2 }, { candidateId: second.id, quantity: 3 },
  ] });
  const approval = await service.requestComparison(c.id, [bundle.id]);
  return { gateway, service, c, bundle, approval };
}

describe('FoodService bounded mixed-item fixed choices', () => {
  it("finds each approved dish's matching seed combination while preserving quantities, variants and exact contents", async () => {
    const { gateway, service, c, approval } = await mixedFixedSetup();
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.quotes[0]).toMatchObject({ itemTotal: 1240, total: 1260, quantity: 2, bundle: true });
    const writes = gateway.calls.filter(call => call.name === 'update_food_cart');
    expect(writes).toHaveLength(7); // Initial attempt plus the sixth distinct permitted combination.
    const approvedItems = approval.plans[0].lines!;
    for (const [attempt, write] of writes.entries()) {
      expect(write.args.cartItems).toHaveLength(2);
      expect(write.args.cartItems.map((line: any) => ({ id: line.menuItemId, quantity: line.quantity, variants: line.variantsV2 }))).toEqual([
        { id: 'custom', quantity: 4, variants: [{ group_id: 'size', variation_id: 'small' }] },
        { id: 'custom-second', quantity: 6, variants: [{ group_id: 'size', variation_id: 'large' }] },
      ]);
      if (attempt > 0) for (const line of write.args.cartItems) {
        const approved = approvedItems.find(item => item.itemId === line.menuItemId)!;
        expect(line.addons).toHaveLength(1);
        expect(approved.selection!.bootstrap).toContainEqual({ groupId: line.addons[0].group_id, choiceId: line.addons[0].choice_id });
      }
    }
    expect(new Set(writes.map(write => JSON.stringify(write.args.cartItems))).size).toBe(7);
    for (let i = 1; i < writes.length; i++)
      expect(gateway.calls.slice(gateway.calls.indexOf(writes[i - 1]) + 1, gateway.calls.indexOf(writes[i])).some(call => call.name === 'get_food_cart')).toBe(true);
    expect(gateway.items).toEqual([]);
  });

  it('limits nine possible fixed combinations to six distinct trials and cleans up after rejection', async () => {
    const { gateway, service, c, approval } = await mixedFixedSetup();
    gateway.rejectAll = true;
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toMatch(/additional choices/);
    expect(result.error).not.toMatch(/could not be safely cleared/);
    expect(result.quotes).toEqual([]);
    expect(result.comparison).toMatchObject({ requested: 1, checked: 0 });
    const writes = gateway.calls.filter(call => call.name === 'update_food_cart');
    expect(writes).toHaveLength(7);
    expect(new Set(writes.map(write => JSON.stringify(write.args.cartItems))).size).toBe(7);
    expect(gateway.items).toEqual([]);
    expect(gateway.calls.at(-1)?.name).toBe('flush_food_cart');
  });

  it.each([1, 3])('stops on uncertain transport failure at attempt %s without trying another combination', async transportAt => {
    const { gateway, service, c, approval } = await mixedFixedSetup();
    gateway.transportAt = transportAt;
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('uncertain transport error');
    expect(result.quotes).toEqual([]);
    expect(gateway.calls.filter(call => call.name === 'update_food_cart')).toHaveLength(transportAt);
    expect(gateway.items).toEqual([]);
  });
});

class CouponFailureGateway extends SyntheticCustomizationGateway {
  constructor(readonly codes: string[]) { super(); }
  override cart() {
    const raw = super.cart();
    const discount = this.coupon === 'GOOD20' ? 20 : this.coupon === 'BETTER30' ? 30 : 0;
    raw.data.pricing.to_pay -= discount;
    raw.data.offers.coupon_discount = discount;
    return raw;
  }
  override async call(name: string, args: Record<string, any>): Promise<any> {
    if (name === 'fetch_food_coupons') {
      this.calls.push({ name, args: structuredClone(args) });
      return { coupon_sections: [{ coupons: this.codes.map(code => ({ code, applicable: true })) }] };
    }
    if (name === 'apply_food_coupon') {
      this.calls.push({ name, args: structuredClone(args) });
      if (args.couponCode === 'EXPIRED') throw new SwiggyResponseError('REJECTED');
      if (args.couponCode === 'UNCERTAIN') throw new Error('Synthetic uncertain coupon transport failure');
      if (args.couponCode === 'MUTATING') {
        this.items = [{ menu_item_id: 'external-cart-item', quantity: 1, total: 120, in_stock: true }];
        throw new SwiggyResponseError('REJECTED');
      }
      this.coupon = args.couponCode;
      return this.cart();
    }
    return super.call(name, args);
  }
}
async function couponFailureSetup(codes: string[]) {
  const gateway = new CouponFailureGateway(codes);
  const service = new FoodService(gateway, idleAgent);
  const c = service.create();
  await service.selectAddress(c.id, 'synthetic-home');
  service.updatePreferences(c.id, { budget: 300 });
  const search = await service.dispatch(c.id, 'food_search', { query: 'burger' });
  const candidate = search.candidates.find((x: Candidate) => x.itemId === 'regular');
  const approval = await service.requestComparison(c.id, [candidate.id]);
  const result = await service.approve(c.id, approval.id);
  return { gateway, service, c, result, applied: gateway.calls.filter(call => call.name === 'apply_food_coupon').map(call => call.args.couponCode) };
}

describe('FoodService coupon rejection recovery', () => {
  it('skips a typed rejected coupon only after unchanged-cart verification, then checks the next code', async () => {
    const { gateway, result, applied } = await couponFailureSetup(['EXPIRED', 'GOOD20']);
    expect(result.error).toBeNull();
    expect(result.approval?.status).toBe('done');
    expect(result.quotes[0]).toMatchObject({ itemTotal: 70, coupon: 'GOOD20', discount: 20, total: 70 });
    expect(result.comparison).toMatchObject({ requested: 1, checked: 1, issues: ['Coupon EXPIRED was rejected; its savings were not counted.'] });
    expect(result.messages.at(-1)?.text).toContain('Coupon EXPIRED was rejected; its savings were not counted.');
    expect(applied).toEqual(['EXPIRED', 'GOOD20']);
    const rejected = gateway.calls.findIndex(call => call.name === 'apply_food_coupon' && call.args.couponCode === 'EXPIRED');
    expect(gateway.calls[rejected + 1].name).toBe('get_food_cart');
    expect(gateway.items).toEqual([]);
  });

  it('retains the earlier confirmed best quote when a later coupon is rejected', async () => {
    const { gateway, result, applied } = await couponFailureSetup(['GOOD20', 'EXPIRED']);
    expect(result.error).toBeNull();
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]).toMatchObject({ coupon: 'GOOD20', discount: 20, total: 70 });
    expect(result.comparison?.issues).toEqual(['Coupon EXPIRED was rejected; its savings were not counted.']);
    expect(applied).toEqual(['GOOD20', 'EXPIRED']);
    expect(gateway.items).toEqual([]);
  });

  it('aborts uncertain coupon transport without retrying or discarding its verified baseline', async () => {
    const { gateway, result, applied } = await couponFailureSetup(['UNCERTAIN', 'BETTER30']);
    expect(result.error).toContain('uncertain coupon transport failure');
    expect(result.approval?.status).toBe('cancelled');
    expect(result.quotes[0]).toMatchObject({ coupon: null, discount: 0, total: 90 });
    expect(result.comparison).toMatchObject({ requested: 1, checked: 1 });
    expect(applied).toEqual(['UNCERTAIN']);
    expect(gateway.items).toEqual([]);
  });

  it('retains earlier confirmed coupon savings if a later trial fails with uncertain transport', async () => {
    const { gateway, result, applied } = await couponFailureSetup(['GOOD20', 'UNCERTAIN', 'BETTER30']);
    expect(result.error).toContain('uncertain coupon transport failure');
    expect(result.quotes[0]).toMatchObject({ coupon: 'GOOD20', discount: 20, total: 70 });
    expect(applied).toEqual(['GOOD20', 'UNCERTAIN']);
    expect(gateway.items).toEqual([]);
  });

  it('aborts a typed rejection if the cart changed, retaining the baseline and leaving the unrecognized cart untouched', async () => {
    const { gateway, result, applied } = await couponFailureSetup(['MUTATING', 'GOOD20']);
    expect(result.error).toContain('Cart changed outside this comparison');
    expect(result.error).toContain('could not be safely cleared');
    expect(result.quotes[0]).toMatchObject({ coupon: null, total: 90 });
    expect(result.comparison?.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('Cart changed outside this comparison'),
      expect.stringContaining('could not be safely cleared'),
    ]));
    expect(applied).toEqual(['MUTATING']);
    expect(gateway.items[0].menu_item_id).toBe('external-cart-item');
    const appliedAt = gateway.calls.findIndex(call => call.name === 'apply_food_coupon');
    expect(gateway.calls.slice(appliedAt + 1).every(call => call.name !== 'flush_food_cart' && call.name !== 'update_food_cart')).toBe(true);
  });
});

class RetainedUnavailableGateway extends SyntheticCustomizationGateway {
  mutate: 'none' | 'wrong-item' | 'wrong-quantity' | 'extra-item' | 'extra-addon' | 'wrong-variant' | 'wrong-restaurant' | 'missing-restaurant' = 'none';
  uncertainTransport = false;
  retained = false;
  override cart() {
    const cart = super.cart();
    if (this.retained && this.mutate === 'wrong-restaurant') cart.data.restaurant = { id: 'other-restaurant', name: 'Synthetic other kitchen' };
    if (this.retained && this.mutate === 'missing-restaurant') cart.data.restaurant = null;
    return { ...cart, statusCode: this.retained && this.items.length ? 8 : 0 };
  }
  override async call(name: string, args: Record<string, any>): Promise<any> {
    if (name === 'flush_food_cart') this.retained = false;
    if (name !== 'update_food_cart') return super.call(name, args);
    await super.call(name, args);
    this.retained = true;
    for (const item of this.items) item.in_stock = 0;
    if (this.mutate === 'wrong-item') this.items[0].menu_item_id = 'unapproved-item';
    if (this.mutate === 'wrong-quantity') this.items[0].quantity++;
    if (this.mutate === 'extra-item') this.items.push({ menu_item_id: 'extra-item', quantity: 1, total: 20, in_stock: true });
    if (this.mutate === 'extra-addon') this.items[0].addons.push({ group_id: 'unapproved-addon-group', choice_id: 'unapproved-addon' });
    if (this.mutate === 'wrong-variant') this.items[0].variants = [{ group_id: 'size', variation_id: 'large' }];
    if (this.uncertainTransport) throw new Error('Synthetic uncertain retained-cart transport failure');
    throw new SwiggyResponseError('UNAVAILABLE');
  }
}
async function retainedUnavailableSetup(configured = false) {
  const gateway = new RetainedUnavailableGateway();
  const service = new FoodService(gateway, idleAgent);
  const c = service.create();
  await service.selectAddress(c.id, 'synthetic-home');
  service.updatePreferences(c.id, { budget: 500 });
  const search = await service.dispatch(c.id, 'food_search', { query: 'burger' });
  const find = (itemId: string) => search.candidates.find((x: Candidate) => x.itemId === itemId);
  const candidate = configured ? await configure(service, c.id, find('custom').id, 'small', false) :
    (await service.dispatch(c.id, 'food_bundle', { items: [{ candidateId: find('regular').id, quantity: 2 }, { candidateId: find('discounted').id, quantity: 1 }] })).candidate;
  const approval = await service.requestComparison(c.id, [candidate.id]);
  return { gateway, service, c, approval };
}

describe('FoodService exact retained out-of-stock cart cleanup', () => {
  it('clears the exact approved out-of-stock cart after the second-stage add-on write is rejected', async () => {
    const { gateway, service, c, base } = await setup();
    const configured = await configure(service, c.id, base.id, 'small', true);
    const original = gateway.call.bind(gateway);
    gateway.call = async (name, args) => {
      const result = await original(name, args);
      if (name === 'update_food_cart' && args.cartItems[0].addons?.length) {
        gateway.items[0].in_stock = 0;
        throw new SwiggyResponseError('UNAVAILABLE');
      }
      return result;
    };
    const approval = await service.requestComparison(c.id, [configured.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('no longer available');
    expect(result.error).not.toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(gateway.calls.filter(call => call.name === 'update_food_cart')).toHaveLength(2);
    expect(gateway.items).toEqual([]);
  });

  it('clears an exact approved out-of-stock cart retained by a typed failure during fixed-choice fallback', async () => {
    const { gateway, service, c, configured } = await fixedSetup();
    const original = gateway.call.bind(gateway);
    gateway.call = async (name, args) => {
      const result = await original(name, args);
      if (name === 'update_food_cart') {
        gateway.items[0].in_stock = 0;
        throw new SwiggyResponseError('UNAVAILABLE');
      }
      return result;
    };
    const approval = await service.requestComparison(c.id, [configured.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('no longer available');
    expect(result.error).not.toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(gateway.calls.filter(call => call.name === 'update_food_cart')).toHaveLength(3);
    expect(gateway.items).toEqual([]);
  });

  it.each([false, true])('clears exact approved retained out-of-stock items without creating quotes (configured=%s)', async configured => {
    const { gateway, service, c, approval } = await retainedUnavailableSetup(configured);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('no longer available');
    expect(result.error).not.toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(result.comparison).toMatchObject({ requested: 1, checked: 0 });
    expect(gateway.calls.filter(call => call.name === 'update_food_cart')).toHaveLength(1);
    expect(gateway.calls.filter(call => call.name === 'flush_food_cart')).toHaveLength(2);
    expect(gateway.items).toEqual([]);
  });

  it.each(['wrong-item', 'wrong-quantity', 'extra-item', 'extra-addon', 'wrong-restaurant', 'missing-restaurant'] as const)('preserves a retained cart with %s instead of treating it as the approved submission', async mutate => {
    const { gateway, service, c, approval } = await retainedUnavailableSetup();
    gateway.mutate = mutate;
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(gateway.items.length).toBeGreaterThan(0);
    expect(gateway.calls.filter(call => call.name === 'update_food_cart')).toHaveLength(1);
    expect(gateway.calls.filter(call => call.name === 'flush_food_cart')).toHaveLength(1);
  });

  it.each(['wrong-variant', 'extra-addon'] as const)('preserves a configured retained cart containing %s', async mutate => {
    const { gateway, service, c, approval } = await retainedUnavailableSetup(true);
    gateway.mutate = mutate;
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(gateway.items).toHaveLength(1);
    expect(gateway.calls.filter(call => call.name === 'flush_food_cart')).toHaveLength(1);
  });

  it('does not retry or adopt even an apparently matching cart following ambiguous transport failure', async () => {
    const { gateway, service, c, approval } = await retainedUnavailableSetup();
    gateway.uncertainTransport = true;
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('uncertain retained-cart transport failure');
    expect(result.error).toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(gateway.items).toHaveLength(2);
    expect(gateway.calls.filter(call => call.name === 'update_food_cart')).toHaveLength(1);
    expect(gateway.calls.filter(call => call.name === 'flush_food_cart')).toHaveLength(1);
  });
});


describe('FoodService authoritative unavailable-write receipts', () => {
  it('accepts a fresh unselected add-on catalog without treating possible choices as cart changes', async () => {
    const { gateway, service, c, approval } = await retainedUnavailableSetup();
    gateway.mutate = 'missing-restaurant';
    const original = gateway.call.bind(gateway);
    let writeFingerprint: string | undefined;
    gateway.call = async (name, args) => {
      try { return await original(name, args); }
      catch (error) {
        if (name !== 'update_food_cart' || !(error instanceof SwiggyResponseError)) throw error;
        const writeCart = gateway.cart();
        const receipt = cartReceiptFingerprint(writeCart, 'synthetic-r');
        writeFingerprint = cartFingerprint(writeCart);
        gateway.items[0].valid_addons = [{ groupId: 'new-catalog-group', groupName: 'Refreshed choices', maxAddons: 2,
          choices: [{ id: 'new-catalog-choice', name: 'Synthetic new possible topping', price: 45 }] }];
        expect(cartFingerprint(gateway.cart())).toBe(writeFingerprint);
        expect(cartReceiptFingerprint(gateway.cart(), 'synthetic-r')).toBe(receipt);
        throw new SwiggyResponseError('UNAVAILABLE', receipt);
      }
    };
    const result = await service.approve(c.id, approval.id);
    expect(writeFingerprint).toBeDefined();
    expect(result.error).not.toContain('could not be safely cleared');
    expect(result.error).toContain('no longer available');
    expect(result.quotes).toEqual([]);
    expect(gateway.items).toEqual([]);
  });

  it.each(['', 'other-restaurant'])('does not adopt a missing-identity cart with an unscoped or wrong-scope receipt (%s)', async scope => {
    const { gateway, service, c, approval } = await retainedUnavailableSetup();
    gateway.mutate = 'missing-restaurant';
    const original = gateway.call.bind(gateway);
    gateway.call = async (name, args) => {
      try { return await original(name, args); }
      catch (error) {
        if (name === 'update_food_cart' && error instanceof SwiggyResponseError)
          throw new SwiggyResponseError('UNAVAILABLE', cartReceiptFingerprint(gateway.cart(), scope));
        throw error;
      }
    };
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(gateway.items).toHaveLength(2);
    expect(gateway.calls.filter(call => call.name === 'flush_food_cart')).toHaveLength(1);
  });

  it.each([false, true])('clears a matching receipt-backed approved cart without restaurant identity (configured=%s)', async configured => {
    const { gateway, service, c, approval } = await retainedUnavailableSetup(configured);
    gateway.mutate = 'missing-restaurant';
    const original = gateway.call.bind(gateway);
    gateway.call = async (name, args) => {
      try { return await original(name, args); }
      catch (error) {
        if (name === 'update_food_cart' && error instanceof SwiggyResponseError)
          throw new SwiggyResponseError('UNAVAILABLE', cartReceiptFingerprint(gateway.cart(), 'synthetic-r'));
        throw error;
      }
    };
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('no longer available');
    expect(result.error).not.toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(gateway.items).toEqual([]);
    expect(gateway.calls.filter(call => call.name === 'update_food_cart')).toHaveLength(1);
    expect(gateway.calls.filter(call => call.name === 'flush_food_cart')).toHaveLength(2);
  });

  it.each(['total', 'offers', 'quantity', 'selected-addon', 'item-price'])('preserves a receipt-backed cart when fresh %s no longer matches the write response', async changed => {
    const { gateway, service, c, approval } = await retainedUnavailableSetup();
    gateway.mutate = 'missing-restaurant';
    const original = gateway.call.bind(gateway);
    gateway.call = async (name, args) => {
      try { return await original(name, args); }
      catch (error) {
        if (name !== 'update_food_cart' || !(error instanceof SwiggyResponseError)) throw error;
        const receipt = cartReceiptFingerprint(gateway.cart(), 'synthetic-r');
        if (changed === 'total') gateway.items[0].total += 1;
        if (changed === 'offers') gateway.coupon = 'EXTERNAL';
        if (changed === 'quantity') gateway.items[0].quantity++;
        if (changed === 'selected-addon') gateway.items[0].addons.push({ group_id: 'extras', choice_id: 'cheese' });
        if (changed === 'item-price') gateway.items[0].final_price = 71;
        throw new SwiggyResponseError('UNAVAILABLE', receipt);
      }
    };
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(gateway.items).toHaveLength(2);
    expect(gateway.calls.filter(call => call.name === 'flush_food_cart')).toHaveLength(1);
  });

  it.each(['extra-addon', 'extra-item', 'wrong-quantity', 'wrong-restaurant'] as const)('does not let an authentic receipt authorize %s outside the frozen plan', async mismatch => {
    const { gateway, service, c, approval } = await retainedUnavailableSetup();
    gateway.mutate = 'missing-restaurant';
    const original = gateway.call.bind(gateway);
    gateway.call = async (name, args) => {
      try { return await original(name, args); }
      catch (error) {
        if (name !== 'update_food_cart' || !(error instanceof SwiggyResponseError)) throw error;
        if (mismatch === 'extra-addon') gateway.items[0].addons.push({ group_id: 'unapproved', choice_id: 'unapproved' });
        if (mismatch === 'extra-item') gateway.items.push({ menu_item_id: 'unapproved', quantity: 1, total: 10, in_stock: 0 });
        if (mismatch === 'wrong-quantity') gateway.items[0].quantity++;
        if (mismatch === 'wrong-restaurant') gateway.mutate = 'wrong-restaurant';
        throw new SwiggyResponseError('UNAVAILABLE', cartReceiptFingerprint(gateway.cart(), 'synthetic-r'));
      }
    };
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(gateway.items.length).toBeGreaterThan(0);
    expect(gateway.calls.filter(call => call.name === 'flush_food_cart')).toHaveLength(1);
  });
});


describe('FoodService final cleanup with changing unused addon catalogs', () => {
  it('completes and clears a verified cart when each fresh cart read returns a different unused catalog', async () => {
    const { gateway, service, c, candidates } = await setup();
    let nonemptyReads = 0;
    const original = gateway.call.bind(gateway);
    gateway.call = async (name, args) => {
      if (name === 'get_food_cart' && gateway.items.length) {
        nonemptyReads++;
        gateway.items[0].valid_addons = [{ groupId: `catalog-${nonemptyReads}`, choices: [
          { id: `possible-${nonemptyReads}`, name: `Synthetic unselected option ${nonemptyReads}`, price: nonemptyReads * 5 },
        ] }];
      }
      return original(name, args);
    };
    const regular = candidates.find(candidate => candidate.itemId === 'regular')!;
    const approval = await service.requestComparison(c.id, [regular.id]);
    const result = await service.approve(c.id, approval.id);
    expect(nonemptyReads).toBeGreaterThanOrEqual(2);
    expect(result.error).toBeNull();
    expect(result.approval?.status).toBe('done');
    expect(result.quotes[0]).toMatchObject({ itemTotal: 70, total: 90 });
    expect(gateway.items).toEqual([]);
    expect(gateway.calls.filter(call => call.name === 'flush_food_cart')).toHaveLength(2);
  });

  async function unavailableWithChurn(change?: string) {
    const { gateway, service, c, approval } = await retainedUnavailableSetup();
    gateway.mutate = 'missing-restaurant';
    const original = gateway.call.bind(gateway);
    let nonemptyReads = 0;
    gateway.call = async (name, args) => {
      if (name === 'get_food_cart' && gateway.items.length) {
        nonemptyReads++;
        gateway.items[0].valid_addons = [{ groupId: `changing-catalog-${nonemptyReads}`, choices: [
          { id: `possible-${nonemptyReads}`, name: `Unused synthetic possibility ${nonemptyReads}`, price: 10 + nonemptyReads },
        ] }];
        // The first read proves the exact retained submission. These changes
        // happen afterward, just before the final concurrency check/cleanup.
        if (nonemptyReads === 2) {
          if (change === 'addon') gateway.items[0].addons.push({ group_id: 'extra', choice_id: 'unrequested' });
          if (change === 'variant') gateway.items[0].variants.push({ group_id: 'size', variation_id: 'unrequested' });
          if (change === 'item') gateway.items[0].menu_item_id = 'unrequested-item';
          if (change === 'quantity') gateway.items[0].quantity++;
          if (change === 'price') gateway.items[0].total++;
          if (change === 'coupon') gateway.coupon = 'EXTERNAL';
          if (change === 'stock') gateway.items[0].in_stock = true;
          if (change === 'restaurant') gateway.mutate = 'wrong-restaurant';
        }
      }
      try { return await original(name, args); }
      catch (error) {
        if (name === 'update_food_cart' && error instanceof SwiggyResponseError)
          throw new SwiggyResponseError('UNAVAILABLE', cartReceiptFingerprint(gateway.cart(), 'synthetic-r'));
        throw error;
      }
    };
    const result = await service.approve(c.id, approval.id);
    return { gateway, result, nonemptyReads };
  }

  it('clears an exact unavailable submission even when both recovery and final cleanup reads have fresh unused catalogs', async () => {
    const { gateway, result, nonemptyReads } = await unavailableWithChurn();
    expect(nonemptyReads).toBe(2);
    expect(result.error).toContain('no longer available');
    expect(result.error).not.toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(gateway.items).toEqual([]);
    expect(gateway.calls.filter(call => call.name === 'flush_food_cart')).toHaveLength(2);
  });

  it.each(['addon', 'variant', 'item', 'quantity', 'price', 'coupon', 'stock', 'restaurant'])('preserves a cart whose actual %s changes before final cleanup despite unrelated catalog churn', async change => {
    const { gateway, result, nonemptyReads } = await unavailableWithChurn(change);
    expect(nonemptyReads).toBe(2);
    expect(result.error).toContain('could not be safely cleared');
    expect(result.quotes).toEqual([]);
    expect(gateway.items).toHaveLength(2);
    expect(gateway.calls.filter(call => call.name === 'flush_food_cart')).toHaveLength(1);
    expect(gateway.calls.filter(call => call.name === 'update_food_cart')).toHaveLength(1);
  });
});
