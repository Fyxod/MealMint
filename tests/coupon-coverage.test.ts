import { describe, expect, it } from 'vitest';
import { couponCheckSummary, couponTrialPlan } from '../src/coupons.js';
import { SwiggyResponseError } from '../src/food.js';
import { MockFoodGateway } from '../src/mock.js';
import { FoodService } from '../src/service.js';
import type { AgentProvider, Quote } from '../src/types.js';

// All offers, addresses, cart totals and gateway failures in this file are synthetic.
const offers = (coupons: any[], extra: Record<string, unknown> = {}) => ({ coupon_sections: [{ coupons }], ...extra });
const code = (value: string, extra: Record<string, unknown> = {}) => ({ code: value, applicable: true, ...extra });
function summaryQuote(checks: NonNullable<Quote['couponChecks']>): Quote {
  return { candidateId: 'synthetic-option', name: 'Synthetic meal', restaurant: 'Synthetic kitchen', quantity: 1,
    itemTotal: 200, delivery: 20, charges: 10, discount: 0, coupon: null, total: 230,
    checkedAt: '2026-10-09T00:00:00.000Z', withinBudget: true, source: 'mock', couponChecks: checks };
}

describe('coupon eligibility and coverage planning', () => {
  it('does not exclude arbitrary identifiers or metadata containing online/card text', () => {
    const raw = offers([
      { id: 'ONLINECARD50', applicable: true, cardMetadata: { channel: 'online' } },
      code('WELCOME20', { id: 'card-provider-reference', onlineAvailability: true }),
    ]);
    expect(couponTrialPlan(raw)).toMatchObject({ visible: 2, eligible: 2, codes: ['ONLINECARD50', 'WELCOME20'] });
  });

  it.each(['Valid on COD and online payments.', 'Available for cash on delivery and card payments.', 'Works with all payment methods, including UPI.'])('allows explicit broad payment compatibility: %s', description => {
    expect(couponTrialPlan(offers([code('BROAD20', { description })])).codes).toEqual(['BROAD20']);
  });

  it.each([
    'Valid only on online payments.',
    'Valid exclusively with card payments.',
    'Requires UPI payment.',
    'Not applicable on COD.',
    'Not valid for cash on delivery.',
  ])('excludes explicit payment restrictions: %s', description => {
    expect(couponTrialPlan(offers([code('RESTRICTED', { description })]))).toMatchObject({ visible: 1, eligible: 0, codes: [] });
  });

  it('lets explicit payment-only flags and bank sections override broad compatibility prose', () => {
    const raw = { coupon_sections: [
      { coupons: [code('FLAGGED', { requiresOnlinePayment: true, description: 'All payment methods' }), code('ONLY', { paymentOnly: true, description: 'COD compatible' })] },
      { type: 'BANK_OFFERS', coupons: [code('BANK20', { description: 'COD compatible' })] },
    ] };
    expect(couponTrialPlan(raw)).toMatchObject({ visible: 3, eligible: 0, codes: [] });
  });

  it('accepts APPLIED but lets explicit false and NOT_APPLICABLE override permissive status', () => {
    const raw = offers([
      { code: 'CURRENT', applicabilityStatus: 'APPLIED' },
      { code: 'LOWERCASE', applicabilityStatus: 'applied' },
      { code: 'FALSE', applicabilityStatus: 'APPLIED', applicable: false },
      { code: 'NOTVALID', applicabilityStatus: 'NOT_APPLICABLE', applicable: true },
      { code: 'UNKNOWN' },
    ]);
    expect(couponTrialPlan(raw)).toMatchObject({ visible: 5, eligible: 2, codes: ['CURRENT', 'LOWERCASE'] });
  });

  it('deduplicates redeemable codes case-insensitively across sections without hiding visible-offer counts', () => {
    const raw = { coupon_sections: [{ coupons: [code('Save20'), code('SAVE20')] }, { coupons: [code('save20'), code('OTHER30')] }] };
    expect(couponTrialPlan(raw)).toMatchObject({ visible: 4, eligible: 2, codes: ['Save20', 'OTHER30'], untried: [] });
  });

  it('bounds default trials at five while retaining all eligible untried codes and COD scope', () => {
    const raw = offers(Array.from({ length: 7 }, (_, index) => code(`DEAL${index + 1}`)), { summary: { filter_applied: 'COD compatible offers only' } });
    expect(couponTrialPlan(raw)).toEqual({ visible: 7, eligible: 7, codes: ['DEAL1', 'DEAL2', 'DEAL3', 'DEAL4', 'DEAL5'], untried: ['DEAL6', 'DEAL7'], scope: 'cod-only' });
  });

  it('distinguishes an empty COD result from incomplete discovery and does not claim all app offers are absent', () => {
    const empty = couponTrialPlan(offers([], { summary: { filter_applied: 'COD' } }));
    const checked = summaryQuote({ status: 'checked', scope: empty.scope, visible: empty.visible, eligible: empty.eligible, attempted: [], rejected: [], untried: [] });
    expect(couponCheckSummary(checked)).toContain('No COD-compatible coupons returned');
    expect(couponCheckSummary(checked)).toContain('other app offers may be absent');
    expect(couponCheckSummary(summaryQuote({ ...checked.couponChecks!, status: 'pending' }))).toContain('Coupon check incomplete');
  });

  it('explains visible ineligible offers and capped coverage rather than claiming an exhaustive best coupon', () => {
    expect(couponCheckSummary(summaryQuote({ status: 'checked', scope: 'visible', visible: 2, eligible: 0, attempted: [], rejected: [], untried: [] }))).toContain('none confirmed eligible');
    const summary = couponCheckSummary(summaryQuote({ status: 'checked', scope: 'visible', visible: 7, eligible: 7,
      attempted: ['A', 'B', 'C', 'D', 'E'], rejected: ['B'], untried: ['F', 'G'] }));
    expect(summary).toContain('Tested 5/7');
    expect(summary).toContain('1 rejected');
    expect(summary).toContain('2 not tested');
  });
});

class CouponCoverageGateway extends MockFoodGateway {
  calls: { name: string; args: Record<string, any> }[] = [];
  couponResponse: any;
  applied: string | null = null;
  rejected = new Set<string>();
  transportFailure: string | null = null;
  failDiscovery = false;
  constructor(readonly savings: Record<string, number>) {
    super();
    this.couponResponse = offers(Object.keys(savings).map(value => code(value)));
  }
  async call(name: string, args: Record<string, any>): Promise<any> {
    this.calls.push({ name, args: structuredClone(args) });
    if (name === 'flush_food_cart') this.applied = null;
    if (name === 'fetch_food_coupons') {
      if (this.failDiscovery) throw new Error('Synthetic coupon discovery unavailable');
      return this.couponResponse;
    }
    if (name === 'apply_food_coupon') {
      if (args.couponCode === this.transportFailure) throw new Error('Synthetic uncertain coupon transport failure');
      if (this.rejected.has(args.couponCode)) throw new SwiggyResponseError('REJECTED');
      this.applied = args.couponCode;
      return this.discounted(await super.call('get_food_cart', args));
    }
    const raw = await super.call(name, args);
    return name === 'get_food_cart' ? this.discounted(raw) : raw;
  }
  private discounted(raw: any) {
    const copy = structuredClone(raw);
    if (!copy.data?.items?.length || !this.applied) return copy;
    const discount = this.savings[this.applied] ?? 0;
    copy.data.offers = { coupon_applied: this.applied, coupon_discount: discount };
    copy.data.pricing.to_pay = Math.round((copy.data.pricing.to_pay - discount) * 100) / 100;
    return copy;
  }
}
const idleAgent: AgentProvider = { async status() { return { connected: true, provider: 'synthetic-test' }; },
  async turn() { return 'Synthetic reply'; }, async cancel() {}, async close() {} };
async function readyCoverage(savings: Record<string, number>, gateway = new CouponCoverageGateway(savings)) {
  const service = new FoodService(gateway, idleAgent);
  const conversation = service.create();
  await service.selectAddress(conversation.id, 'mock-home');
  service.updatePreferences(conversation.id, { budget: 300 });
  const search = await service.dispatch(conversation.id, 'food_search', { query: 'thali' });
  const approval = await service.requestComparison(conversation.id, [search.candidates[0].id]);
  return { gateway, service, conversation, approval };
}
const five = { FIRST: 5, SECOND: 10, THIRD: 15, FOURTH: 60, FIFTH: 80 };

describe('FoodService bounded coupon coverage', () => {
  it.each(['FOURTH', 'FIFTH'])('finds a %s-code winner beyond the old three-trial limit and clears the test cart', async winningCode => {
    const savings = { ...five, [winningCode]: 90 };
    const { gateway, service, conversation, approval } = await readyCoverage(savings);
    const result = await service.approve(conversation.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]).toMatchObject({ coupon: winningCode, discount: 90, total: 77.45 });
    expect(result.quotes[0].couponChecks).toEqual({ status: 'checked', scope: 'visible', visible: 5, eligible: 5,
      attempted: Object.keys(savings), rejected: [], untried: [] });
    expect(gateway.calls.filter(call => call.name === 'apply_food_coupon').map(call => call.args.couponCode)).toEqual(Object.keys(savings));
    expect(couponCheckSummary(result.quotes[0])).toContain('Tested 5/5');
    expect((await gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items).toEqual([]);
  });

  it('leaves sixth and seventh eligible offers explicitly untried rather than silently dropping them', async () => {
    const { gateway, service, conversation, approval } = await readyCoverage({ ...five, SIXTH: 95, SEVENTH: 100 });
    const result = await service.approve(conversation.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.quotes[0]).toMatchObject({ coupon: 'FIFTH', discount: 80 });
    expect(result.quotes[0].couponChecks).toMatchObject({ visible: 7, eligible: 7, attempted: Object.keys(five), untried: ['SIXTH', 'SEVENTH'] });
    expect(gateway.calls.filter(call => call.name === 'apply_food_coupon')).toHaveLength(5);
    expect(couponCheckSummary(result.quotes[0])).toContain('Tested 5/7');
    expect(couponCheckSummary(result.quotes[0])).toContain('2 not tested');
    expect((await gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items).toEqual([]);
  });

  it('records confirmed rejection as attempted/rejected, excludes its savings and continues remaining trials', async () => {
    const { gateway, service, conversation, approval } = await readyCoverage(five);
    gateway.rejected.add('FIRST');
    const result = await service.approve(conversation.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.quotes[0]).toMatchObject({ coupon: 'FIFTH', discount: 80 });
    expect(result.quotes[0].couponChecks).toMatchObject({ status: 'checked', attempted: Object.keys(five), rejected: ['FIRST'], untried: [] });
    expect(couponCheckSummary(result.quotes[0])).toContain('1 rejected');
    expect((await gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items).toEqual([]);
  });

  it('stops uncertain transport, preserves prior verified savings and labels coupon work incomplete', async () => {
    const { gateway, service, conversation, approval } = await readyCoverage(five);
    gateway.transportFailure = 'THIRD';
    const result = await service.approve(conversation.id, approval.id);
    expect(result.error).toContain('uncertain coupon transport failure');
    expect(result.quotes[0]).toMatchObject({ coupon: 'SECOND', discount: 10 });
    expect(result.quotes[0].couponChecks).toMatchObject({ status: 'pending', attempted: ['FIRST', 'SECOND', 'THIRD'], rejected: [], untried: ['THIRD', 'FOURTH', 'FIFTH'] });
    expect(gateway.calls.filter(call => call.name === 'apply_food_coupon').map(call => call.args.couponCode)).toEqual(['FIRST', 'SECOND', 'THIRD']);
    expect(couponCheckSummary(result.quotes[0])).toContain('Coupon check incomplete');
    expect(couponCheckSummary(result.quotes[0])).not.toContain('Tested 5/5');
    expect((await gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items).toEqual([]);
  });

  it('keeps failed coupon discovery distinct from a successful empty COD-filtered result', async () => {
    const failed = await readyCoverage(five);
    failed.gateway.failDiscovery = true;
    const failedResult = await failed.service.approve(failed.conversation.id, failed.approval.id);
    expect(failedResult.error).toContain('coupon discovery unavailable');
    expect(failedResult.quotes[0].couponChecks).toMatchObject({ status: 'pending', attempted: [] });
    expect(couponCheckSummary(failedResult.quotes[0])).toContain('incomplete');
    expect(couponCheckSummary(failedResult.quotes[0])).not.toContain('No COD-compatible');
    const empty = await readyCoverage({});
    empty.gateway.couponResponse = offers([], { summary: { filter_applied: 'COD-only' } });
    const emptyResult = await empty.service.approve(empty.conversation.id, empty.approval.id);
    expect(emptyResult.error).toBeNull();
    expect(emptyResult.quotes[0].couponChecks).toEqual({ status: 'checked', scope: 'cod-only', visible: 0, eligible: 0, attempted: [], rejected: [], untried: [] });
    expect(couponCheckSummary(emptyResult.quotes[0])).toContain('No COD-compatible coupons returned');
    expect((await failed.gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items).toEqual([]);
    expect((await empty.gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items).toEqual([]);
  });
});


class RejectedMarkerGateway extends CouponCoverageGateway {
  marker = false;
  mutation: 'none' | 'food' | 'total' | 'discount' | 'other-offer' | 'other-code' | 'stock' = 'none';
  override async call(name: string, args: Record<string, any>): Promise<any> {
    if (name === 'flush_food_cart') this.marker = false;
    if (name === 'apply_food_coupon' && args.couponCode === 'BROKEN') {
      this.calls.push({ name, args: structuredClone(args) });
      this.marker = true;
      this.applied = 'BROKEN';
      throw new SwiggyResponseError('REJECTED');
    }
    const raw = await super.call(name, args);
    if (name === 'get_food_cart' && this.marker && raw.data?.items?.length) {
      if (this.mutation === 'food') raw.data.items[0].menu_item_id = 'unapproved-item';
      if (this.mutation === 'total') raw.data.pricing.to_pay += 1;
      if (this.mutation === 'discount') raw.data.offers.coupon_discount = 1;
      if (this.mutation === 'other-offer') raw.data.offers.external_offer = 'UNAPPROVED';
      if (this.mutation === 'other-code') raw.data.offers.coupon_applied = 'OTHER';
      if (this.mutation === 'stock') raw.data.items[0].in_stock = 0;
    }
    return raw;
  }
}

describe('confirmed coupon rejection with a zero-saving attempted-code marker', () => {
  it('continues from the exact marker-only mutation, counts no rejected savings and clears the cart', async () => {
    const savings = { BROKEN: 0, GOOD20: 20 };
    const gateway = new RejectedMarkerGateway(savings);
    const { service, conversation, approval } = await readyCoverage(savings, gateway);
    const result = await service.approve(conversation.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.approval?.status).toBe('done');
    expect(result.quotes[0]).toMatchObject({ coupon: 'GOOD20', discount: 20, total: 147.45 });
    expect(result.quotes[0].couponChecks).toMatchObject({ status: 'checked', attempted: ['BROKEN', 'GOOD20'], rejected: ['BROKEN'], untried: [] });
    expect(gateway.calls.filter(call => call.name === 'apply_food_coupon').map(call => call.args.couponCode)).toEqual(['BROKEN', 'GOOD20']);
    expect((await gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items).toEqual([]);
  });

  it('clears a final rejected zero-saving marker while returning the verified no-coupon baseline', async () => {
    const gateway = new RejectedMarkerGateway({ BROKEN: 0 });
    const { service, conversation, approval } = await readyCoverage({ BROKEN: 0 }, gateway);
    const result = await service.approve(conversation.id, approval.id);
    expect(result.error).toBeNull();
    expect(result.quotes[0]).toMatchObject({ coupon: null, discount: 0, total: 167.45 });
    expect(result.quotes[0].couponChecks).toMatchObject({ rejected: ['BROKEN'], status: 'checked' });
    expect((await gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items).toEqual([]);
  });

  it.each(['food', 'total', 'discount', 'other-offer', 'other-code', 'stock'] as const)('stops and preserves the cart when rejection changes %s beyond the exact zero-saving marker', async mutation => {
    const savings = { BROKEN: 0, GOOD20: 20 };
    const gateway = new RejectedMarkerGateway(savings);
    gateway.mutation = mutation;
    const { service, conversation, approval } = await readyCoverage(savings, gateway);
    const result = await service.approve(conversation.id, approval.id);
    expect(result.error).toContain('Cart changed during coupon rejection');
    expect(result.error).toContain('could not be safely cleared');
    expect(result.quotes[0]).toMatchObject({ coupon: null, discount: 0, total: 167.45 });
    expect(result.quotes[0].couponChecks).toMatchObject({ status: 'pending', attempted: ['BROKEN'], rejected: [], untried: ['BROKEN', 'GOOD20'] });
    expect(gateway.calls.filter(call => call.name === 'apply_food_coupon').map(call => call.args.couponCode)).toEqual(['BROKEN']);
    const writeIndex = gateway.calls.findIndex(call => call.name === 'apply_food_coupon');
    expect(gateway.calls.slice(writeIndex + 1).some(call => call.name === 'flush_food_cart' || call.name === 'update_food_cart')).toBe(false);
    expect((await gateway.call('get_food_cart', { addressId: 'mock-home' })).data.items.length).toBeGreaterThan(0);
  });
});
