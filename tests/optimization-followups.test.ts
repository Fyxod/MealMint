import { describe, expect, it, vi } from 'vitest';
import { MockFoodGateway } from '../src/mock.js';
import { FoodService } from '../src/service.js';
import { couponCheckSummary } from '../src/coupons.js';
import type { AgentProvider } from '../src/types.js';

// All data is synthetic, including coupon hints and paginated menu responses.
const agent: AgentProvider = {
  async status() { return { connected: true, provider: 'synthetic-test' }; },
  async turn() { return 'Synthetic assistant suggests MENU_INJECTED.'; },
  async cancel() {}, async close() {},
};
class FollowupGateway extends MockFoodGateway {
  calls: { name: string; args: Record<string, any> }[] = [];
  coupons: any = { coupon_sections: [], summary: { filter_applied: 'COD' } };
  savings: Record<string, number> = { FLAT100: 100 };
  activeCoupon: string | null = null;
  pages = new Map<number, any>();
  async call(name: string, args: Record<string, any>): Promise<any> {
    this.calls.push({ name, args: structuredClone(args) });
    if (name === 'search_menu') return this.pages.get(args.offset ?? 0) ?? { items: [], hasMore: false };
    if (name === 'fetch_food_coupons') return this.coupons;
    if (name === 'flush_food_cart') this.activeCoupon = null;
    if (name === 'apply_food_coupon') {
      this.activeCoupon = args.couponCode;
      return this.price(await super.call('get_food_cart', args));
    }
    const raw = await super.call(name, args);
    return name === 'get_food_cart' ? this.price(raw) : raw;
  }
  price(raw: any) {
    const result = structuredClone(raw);
    if (this.activeCoupon && result.data?.items?.length) {
      const discount = this.savings[this.activeCoupon] ?? 0;
      result.data.offers = { coupon_applied: this.activeCoupon, coupon_discount: discount };
      result.data.pricing.to_pay = Math.round((result.data.pricing.to_pay - discount) * 100) / 100;
    }
    return result;
  }
}
async function ready(query = 'thali') {
  const gateway = new FollowupGateway();
  const service = new FoodService(gateway, agent);
  const c = service.create();
  await service.selectAddress(c.id, 'mock-home');
  service.updatePreferences(c.id, { budget: 500 });
  const search = await service.dispatch(c.id, 'food_search', { query });
  return { gateway, service, c, candidates: search.candidates, candidate: search.candidates[0] };
}
const hint = (service: FoodService, id: string, candidateId: string, couponCode: string) =>
  service.dispatch(id, 'food_offers', { candidateId, couponCode });

describe('explicit user coupon hints', () => {
  it('tries an explicitly supplied code despite an empty catalogue and verifies its actual lower payable price', async () => {
    const { gateway, service, c, candidate } = await ready();
    await service.chat(c.id, 'Please test FLAT100 from my synthetic offer.');
    const result = await hint(service, c.id, candidate.id, 'FLAT100');
    expect(result.requestedCouponTrial).toBe('FLAT100');
    expect(gateway.calls.filter(call => call.name === 'fetch_food_coupons').at(-1)?.args).toMatchObject({ restaurantId: 'r1', couponCode: 'FLAT100' });
    expect(gateway.calls.some(call => call.name === 'apply_food_coupon')).toBe(false);
    const approval = await service.requestComparison(c.id, [candidate.id]);
    expect(approval.couponHints).toEqual({ r1: ['FLAT100'] });
    const completed = await service.approve(c.id, approval.id);
    expect(completed.error).toBeNull();
    expect(completed.quotes[0]).toMatchObject({ coupon: 'FLAT100', discount: 100, total: 67.45 });
    expect(completed.quotes[0].couponChecks).toMatchObject({ visible: 0, eligible: 0, requested: ['FLAT100'], considered: 1, attempted: ['FLAT100'], untried: [], status: 'checked' });
    expect(couponCheckSummary(completed.quotes[0])).not.toContain('No COD-compatible coupons returned');
    expect((await gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items).toEqual([]);
  });

  it.each(['INVENTED', 'MENU_INJECTED', 'PROVIDER_INJECTED', 'FLAT100'])('rejects an unapproved %s code absent as a token in a user message', async requested => {
    const { gateway, service, c, candidate } = await ready();
    await service.chat(c.id, 'Try NOTFLAT100X only as a synthetic example.');
    gateway.coupons = { coupon_sections: [{ coupons: [{ code: 'PROVIDER_INJECTED', applicable: true }] }] };
    await service.dispatch(c.id, 'food_offers', { candidateId: candidate.id });
    const before = gateway.calls.length;
    await expect(hint(service, c.id, candidate.id, requested)).rejects.toThrow(/explicitly supplied by the user/);
    expect(gateway.calls).toHaveLength(before);
  });

  it('matches user tokens case-insensitively, deduplicates hints and leaves an existing approval valid for the same code', async () => {
    const { service, c, candidate } = await ready();
    await service.chat(c.id, 'Try (Flat100), please.');
    await hint(service, c.id, candidate.id, 'FLAT100');
    const approval = await service.requestComparison(c.id, [candidate.id]);
    await hint(service, c.id, candidate.id, 'flat100');
    expect(approval.status).toBe('pending');
    expect(approval.couponHints).toEqual({ r1: ['FLAT100'] });
  });

  it('freezes old hint lists and cancels pending approval when a new distinct code is added', async () => {
    const { service, c, candidate } = await ready();
    await service.chat(c.id, 'Try FIRST and SECOND.');
    await hint(service, c.id, candidate.id, 'FIRST');
    const first = await service.requestComparison(c.id, [candidate.id]);
    await hint(service, c.id, candidate.id, 'SECOND');
    expect(first.status).toBe('cancelled');
    expect(first.couponHints).toEqual({ r1: ['FIRST'] });
    await expect(service.approve(c.id, first.id)).rejects.toThrow(/already used/);
    const next = await service.dispatch(c.id, 'food_compare', { candidateIds: [candidate.id] });
    expect(next.plans[0].requestedCoupons).toEqual(['FIRST', 'SECOND']);
    expect(c.approval?.couponHints).toEqual({ r1: ['FIRST', 'SECOND'] });
  });

  it('enforces three distinct hints per restaurant while keeping restaurant scopes separate', async () => {
    const { service, c, candidates } = await ready('thali roll');
    const first = candidates.find((entry: any) => entry.restaurantId === 'r1');
    const other = candidates.find((entry: any) => entry.restaurantId === 'r2');
    await service.chat(c.id, 'Test ONE TWO THREE FOUR.');
    for (const value of ['ONE', 'TWO', 'THREE']) await hint(service, c.id, first.id, value);
    await expect(hint(service, c.id, first.id, 'FOUR')).rejects.toThrow(/At most three/);
    await hint(service, c.id, other.id, 'FOUR');
    const approval = await service.requestComparison(c.id, [other.id]);
    expect(approval.couponHints).toEqual({ r2: ['FOUR'] });
  });

  it.each(['preferences', 'address'])('clears queued hints when %s change', async change => {
    const { service, c, candidate } = await ready();
    await service.chat(c.id, 'Try FLAT100.');
    await hint(service, c.id, candidate.id, 'FLAT100');
    const approval = await service.requestComparison(c.id, [candidate.id]);
    if (change === 'preferences') service.updatePreferences(c.id, { budget: 400 });
    else await service.selectAddress(c.id, 'mock-office');
    expect(approval.status).toBe('cancelled');
    const search = await service.dispatch(c.id, 'food_search', { query: 'thali' });
    const next = await service.requestComparison(c.id, [search.candidates[0].id]);
    expect(next.couponHints).toEqual({ r1: [] });
    expect((await service.dispatch(c.id, 'food_context', {})).requestedCouponTrials).toEqual({});
  });

  it('prioritizes user-requested trials within the five-code cap and keeps remaining catalogue codes visible as untried', async () => {
    const { gateway, service, c, candidate } = await ready();
    gateway.coupons = { coupon_sections: [{ coupons: ['CAT1', 'CAT2', 'CAT3', 'CAT4', 'CAT5', 'CAT6'].map(code => ({ code, applicable: true })) }] };
    await service.chat(c.id, 'Please try HINT1 HINT2 HINT3.');
    for (const value of ['HINT1', 'HINT2', 'HINT3']) await hint(service, c.id, candidate.id, value);
    const approval = await service.requestComparison(c.id, [candidate.id]);
    const result = await service.approve(c.id, approval.id);
    expect(result.error).toBeNull();
    expect(gateway.calls.filter(call => call.name === 'apply_food_coupon').map(call => call.args.couponCode)).toEqual(['HINT1', 'HINT2', 'HINT3', 'CAT1', 'CAT2']);
    expect(result.quotes[0].couponChecks).toMatchObject({ requested: ['HINT1', 'HINT2', 'HINT3'], considered: 9, attempted: ['HINT1', 'HINT2', 'HINT3', 'CAT1', 'CAT2'], untried: ['CAT3', 'CAT4', 'CAT5', 'CAT6'] });
    expect((await gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items).toEqual([]);
  });
});

function customItem(extra: Record<string, any> = {}) {
  return { menu_item_id: 'i14', name: 'Custom pizza', restaurant_id: 'r5', inStock: 1, hasAddons: true,
    addons: [{ groupId: 'extras', groupName: 'Synthetic extras', maxAddons: 1, choices: [{ id: 'cheese', name: 'Synthetic cheese', price: 10 }] }], ...extra };
}
async function customReady() {
  const state = await ready('pizza');
  const candidate = state.candidates.find((entry: any) => entry.itemId === 'i14');
  state.gateway.calls = [];
  return { ...state, candidate };
}
const searchCalls = (gateway: FollowupGateway) => gateway.calls.filter(call => call.name === 'search_menu');

describe('bounded exact customization discovery', () => {
  it('finds a later exact ID without configuring an identically named earlier listing', async () => {
    const { gateway, service, c, candidate } = await customReady();
    gateway.pages.set(0, { items: [customItem({ menu_item_id: 'lookalike', addons: [] })], hasMore: true, nextOffset: 10 });
    gateway.pages.set(10, { items: [customItem()], hasMore: false });
    const options = await service.customizationOptions(c.id, candidate.id);
    expect(options.details.addons[0].choices[0].id).toBe('cheese');
    expect(searchCalls(gateway).map(call => call.args.offset ?? 0)).toEqual([0, 10]);
    expect(searchCalls(gateway).every(call => call.args.restaurantIdOfAddedItem === 'r5')).toBe(true);
  });

  it('limits one operation to five pages, then resumes the saved cursor on the next manual request', async () => {
    const { gateway, service, c, candidate } = await customReady();
    for (let page = 0; page < 5; page++) gateway.pages.set(page * 10, { items: [], hasMore: true, nextOffset: (page + 1) * 10 });
    gateway.pages.set(50, { items: [customItem()], hasMore: false });
    await expect(service.customizationOptions(c.id, candidate.id)).rejects.toThrow(/incomplete.*continue the next pages/);
    expect(searchCalls(gateway)).toHaveLength(5);
    const options = await service.customizationOptions(c.id, candidate.id);
    expect(options.details.addons).toHaveLength(1);
    expect(searchCalls(gateway).map(call => call.args.offset ?? 0)).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it('resets the read allowance for each manual continuation rather than exhausting the old agent turn quota', async () => {
    const { gateway, service, c, candidate } = await customReady();
    for (let page = 0; page < 25; page++) gateway.pages.set(page, { items: [], hasMore: true, nextOffset: page + 1 });
    gateway.pages.set(25, { items: [customItem()], hasMore: false });
    for (let chunk = 0; chunk < 5; chunk++) await expect(service.customizationOptions(c.id, candidate.id)).rejects.toThrow(/incomplete/);
    const options = await service.customizationOptions(c.id, candidate.id);
    expect(options.details.addons).toHaveLength(1);
    expect(searchCalls(gateway)).toHaveLength(26);
  });

  it('expires a saved continuation after five minutes and starts a fresh search', async () => {
    const { gateway, service, c, candidate } = await customReady();
    for (let page = 0; page < 5; page++) gateway.pages.set(page, { items: [], hasMore: true, nextOffset: page + 1 });
    await expect(service.customizationOptions(c.id, candidate.id)).rejects.toThrow(/incomplete/);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001);
    try {
      gateway.pages.set(0, { items: [customItem()], hasMore: false });
      await service.customizationOptions(c.id, candidate.id);
      expect(searchCalls(gateway).at(-1)?.args.offset).toBeUndefined();
    } finally { clock.mockRestore(); }
  });

  it('reports exhausted menu/search disagreement rather than asserting the dish is out of stock', async () => {
    const { gateway, service, c, candidate } = await customReady();
    gateway.pages.set(0, { items: [customItem({ menu_item_id: 'lookalike' })], hasMore: false });
    await expect(service.customizationOptions(c.id, candidate.id)).rejects.toThrow(/menu and search may disagree/);
    expect(searchCalls(gateway)).toHaveLength(1);
  });

  it('treats an explicit exact-listing stock-zero response as unavailable', async () => {
    const { gateway, service, c, candidate } = await customReady();
    gateway.pages.set(0, { items: [customItem({ inStock: 0 })], hasMore: false });
    await expect(service.customizationOptions(c.id, candidate.id)).rejects.toThrow(/no longer available/);
    expect(searchCalls(gateway)).toHaveLength(1);
  });

  it.each([0, -1, 'invalid'])('stops an invalid/non-advancing cursor %s without retrying the page', async nextOffset => {
    const { gateway, service, c, candidate } = await customReady();
    gateway.pages.set(0, { items: [], hasMore: true, nextOffset });
    await expect(service.customizationOptions(c.id, candidate.id)).rejects.toThrow(/invalid page cursor/);
    expect(searchCalls(gateway)).toHaveLength(1);
  });

  it('stops a cursor that repeats after advancement and discards that continuation', async () => {
    const { gateway, service, c, candidate } = await customReady();
    gateway.pages.set(0, { items: [], hasMore: true, nextOffset: 10 });
    gateway.pages.set(10, { items: [], hasMore: true, nextOffset: 10 });
    await expect(service.customizationOptions(c.id, candidate.id)).rejects.toThrow(/invalid page cursor/);
    expect(searchCalls(gateway).map(call => call.args.offset ?? 0)).toEqual([0, 10]);
    gateway.pages.set(0, { items: [customItem()], hasMore: false });
    await service.customizationOptions(c.id, candidate.id);
    expect(searchCalls(gateway).at(-1)?.args.offset).toBeUndefined();
  });

  it('rejects the exact ID from a foreign restaurant and accepts a later match only in the observed scope', async () => {
    const { gateway, service, c, candidate } = await customReady();
    gateway.pages.set(0, { items: [customItem({ restaurant_id: 'foreign', addons: [] })], hasMore: true, nextOffset: 10 });
    gateway.pages.set(10, { items: [customItem()], hasMore: false });
    const options = await service.customizationOptions(c.id, candidate.id);
    expect(options.details.addons[0].id).toBe('extras');
    expect(searchCalls(gateway)).toHaveLength(2);
  });
});
