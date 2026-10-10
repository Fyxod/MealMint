import { describe, expect, it } from 'vitest';
import { FoodService } from '../src/service.js';
import { MockFoodGateway } from '../src/mock.js';
import type { AgentProvider } from '../src/types.js';

// Synthetic account/cart fields only; never use real account payloads here.
const agent: AgentProvider = { async status() { return { connected: true, provider: 'synthetic-test' }; },
  async turn() { return 'Synthetic reply'; }, async cancel() {}, async close() {} };
class SnapshotGateway extends MockFoodGateway {
  calls: string[] = [];
  raw: any = { statusCode: 0, data: {
    restaurant: { id: 'synthetic-restaurant', name: 'Synthetic kitchen', deliverySubtitle: 'PRIVATE_ADDRESS_SENTINEL' },
    cart_id: 'PRIVATE_CART_SENTINEL', items: [{ menu_item_id: 'synthetic-burger', name: 'Synthetic burger', quantity: 3,
      in_stock: 1, variants: [{ privateCatalog: 'PRIVATE_VARIANT_SENTINEL' }] }],
    pricing: { item_total: 225, delivery_charge: 0, taxes_and_charges: 42.23, to_pay: 267 },
    offers: { coupon_applied: 'SYNTHETIC100', coupon_discount: 0, free_delivery_applied: true },
    payment: { account: 'PRIVATE_PAYMENT_SENTINEL' },
  }, addressId: 'PRIVATE_ADDRESS_ID_SENTINEL', sid: 'PRIVATE_SESSION_SENTINEL' };
  async call(name: string, args: Record<string, any>): Promise<any> {
    this.calls.push(name);
    return name === 'get_food_cart' ? structuredClone(this.raw) : super.call(name, args);
  }
}
async function ready() {
  const gateway = new SnapshotGateway(); const service = new FoodService(gateway, agent); const c = service.create();
  await service.selectAddress(c.id, 'mock-home'); gateway.calls = [];
  return { gateway, service, c };
}

describe('read-only current cart evidence', () => {
  it('exposes actual counts and zero-saving coupon state without private cart/address/session/payment fields or writes', async () => {
    const { gateway, service, c } = await ready();
    const snapshot = await service.dispatch(c.id, 'food_current_cart', {});
    expect(snapshot).toMatchObject({ state: 'present', source: 'mock',
      items: [{ itemId: 'synthetic-burger', name: 'Synthetic burger', quantity: 3 }],
      pricing: { itemSubtotal: 225, delivery: 0, charges: 42.23, total: 267 },
      coupon: { code: 'SYNTHETIC100', discount: 0, positiveDiscount: false }, freeDeliveryApplied: true });
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE_');
    expect(gateway.calls).toEqual(['get_food_cart']);
    expect(c.approval).toBeNull(); expect(c.quotes).toEqual([]);
    expect(snapshot.note).toContain('lower app checkout total');
  });
  it('reports an observed positive coupon discount without creating a comparison result', async () => {
    const { gateway, service, c } = await ready();
    gateway.raw.data.offers.coupon_discount = 100; gateway.raw.data.pricing.to_pay = 159;
    const snapshot = await service.dispatch(c.id, 'food_current_cart', {});
    expect(snapshot.coupon).toMatchObject({ discount: 100, positiveDiscount: true });
    expect(snapshot.pricing.total).toBe(159); expect(c.quotes).toEqual([]);
  });
  it.each([6, 8])('does not present unavailable food as payable despite an old price and coupon at status %s', async status => {
    const { gateway, service, c } = await ready(); gateway.raw.statusCode = status; gateway.raw.data.items[0].in_stock = 0;
    const snapshot = await service.dispatch(c.id, 'food_current_cart', {});
    expect(snapshot.state).toBe('unavailable'); expect(snapshot.pricing.total).toBeNull();
    expect(snapshot.items[0].quantity).toBe(3);
  });
  it('recognizes the successful null-cart response separately from an unsupported missing shape', async () => {
    const { gateway, service, c } = await ready();
    gateway.raw = { statusCode: 0, successful: true, data: null };
    const empty = await service.dispatch(c.id, 'food_current_cart', {});
    expect(empty).toMatchObject({ state: 'empty', items: [], pricing: { total: null } });
    gateway.raw = { successful: true };
    expect(await service.dispatch(c.id, 'food_current_cart', {})).toMatchObject({ state: 'unknown', pricing: { total: null } });
  });
  it('does not manufacture valid prices or counts from malformed numeric fields', async () => {
    const { gateway, service, c } = await ready();
    gateway.raw.data.items[0].quantity = -1;
    gateway.raw.data.pricing = { item_total: '225', delivery_charge: -1, taxes_and_charges: NaN, to_pay: Infinity };
    gateway.raw.data.offers.coupon_discount = -1;
    const snapshot = await service.dispatch(c.id, 'food_current_cart', {});
    expect(snapshot.items[0].quantity).toBeNull();
    expect(snapshot.pricing).toEqual({ itemSubtotal: null, delivery: null, charges: null, total: null });
    expect(snapshot.coupon).toMatchObject({ discount: null, positiveDiscount: false });
  });
  it('requires a freshly selected saved address and rejects additional tool arguments', async () => {
    const gateway = new SnapshotGateway(); const service = new FoodService(gateway, agent); const c = service.create();
    await expect(service.dispatch(c.id, 'food_current_cart', {})).rejects.toThrow(/saved delivery address/);
    expect(gateway.calls).toEqual([]);
    await service.selectAddress(c.id, 'mock-home'); gateway.calls = [];
    await expect(service.dispatch(c.id, 'food_current_cart', { addressId: 'invented' })).rejects.toThrow();
    expect(gateway.calls).toEqual([]);
  });
  it('does not promote a failed response containing stale items into a payable price', async () => {
    const { gateway, service, c } = await ready();
    gateway.raw.successful = false;
    expect(await service.dispatch(c.id, 'food_current_cart', {})).toMatchObject({ state: 'unknown', pricing: { total: null } });
    gateway.raw.successful = true; gateway.raw.statusCode = 99;
    expect(await service.dispatch(c.id, 'food_current_cart', {})).toMatchObject({ state: 'unknown', pricing: { total: null } });
    gateway.raw.statusCode = 0; gateway.raw.success = false;
    expect(await service.dispatch(c.id, 'food_current_cart', {})).toMatchObject({ state: 'unknown', pricing: { total: null } });
  });
  it('handles malformed item entries without inventing an item identity or quoting a partial cart', async () => {
    const { gateway, service, c } = await ready();
    delete gateway.raw.data.items[0].menu_item_id;
    gateway.raw.data.items.push(null, 'bad-item');
    const snapshot = await service.dispatch(c.id, 'food_current_cart', {});
    expect(snapshot).toMatchObject({ state: 'unknown', items: [{ itemId: null, quantity: 3 }], pricing: { total: null } });
    expect(gateway.calls).toEqual(['get_food_cart']);
  });
});
