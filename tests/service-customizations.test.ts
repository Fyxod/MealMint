import { describe, expect, it, vi } from 'vitest';
import { FoodService } from '../src/service.js';
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
        const unit = id === 'custom' ? (variants[0]?.variation_id === 'large' ? 140 : 100) + (addons.length ? 10 : 0) : (id === 'regular' || id === '123') ? 70 : 59;
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
async function setup(legacy = false) {
  const gateway = new SyntheticCustomizationGateway(legacy);
  const service = new FoodService(gateway, idleAgent);
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
    expect(result.error).toMatch(/do not match|unavailable/);
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
