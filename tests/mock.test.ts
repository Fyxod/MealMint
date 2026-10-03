import { beforeEach, describe, expect, it } from 'vitest';
import { MockFoodGateway } from '../src/mock.js';

describe('MockFoodGateway', () => {
  let gateway: MockFoodGateway;

  beforeEach(() => {
    gateway = new MockFoodGateway();
  });

  it('labels its saved addresses as synthetic demonstration data', async () => {
    const addresses = await gateway.call('get_addresses', {});

    expect(addresses).toEqual([
      { id: 'mock-home', label: 'Home', display: 'Demo neighbourhood · synthetic address' },
      { id: 'mock-office', label: 'Office', display: 'Demo business district · synthetic address' }
    ]);
  });

  it('applies vegetarian and under-₹100 filters to search results', async () => {
    const result: any = await gateway.call('search_menu', {
      query: 'food',
      addressId: 'mock-home',
      vegFilter: 1,
      collection: 'STORE_99'
    });

    expect(result.dishes.length).toBeGreaterThan(0);
    expect(result.dishes.every((dish: any) => dish.isVeg && dish.price <= 99)).toBe(true);
    expect(result.dishes.map((dish: any) => dish.id)).not.toContain('i3');
    expect(result.dishes.map((dish: any) => dish.id)).not.toContain('i6');
  });

  it('shows a restaurant as closed and preserves stock/customization details', async () => {
    const result: any = await gateway.call('get_restaurant_menu', {
      restaurantId: 'r6',
      addressId: 'mock-home'
    });

    expect(result.restaurant.isOpen).toBe(false);
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'i15', inStock: 1, hasVariants: false })
    ]);
  });

  it('returns item, delivery and tax totals from the cart and verifies coupon savings', async () => {
    await gateway.call('update_food_cart', {
      restaurantId: 'r1',
      addressId: 'mock-home',
      cartItems: [{ menuItemId: 'i1', quantity: 1 }]
    });

    const beforeCoupon: any = await gateway.call('get_food_cart', { addressId: 'mock-home' });
    expect(beforeCoupon.data.pricing).toEqual({
      item_total: 129,
      delivery_charge: 24,
      taxes_and_charges: 14.45,
      to_pay: 167.45
    });

    const coupons: any = await gateway.call('fetch_food_coupons', {
      restaurantId: 'r1',
      addressId: 'mock-home'
    });
    const restaurantCoupons = coupons.coupon_sections[0].coupons;
    expect(restaurantCoupons.find((coupon: any) => coupon.id === 'SAVE20').applicable).toBe(true);
    expect(restaurantCoupons.find((coupon: any) => coupon.id === 'FLAT40').applicable).toBe(false);
    expect(coupons.coupon_sections[1].coupons[0]).toMatchObject({
      id: 'CARD100',
      applicable: false,
      applicabilityStatus: 'NOT_APPLICABLE'
    });

    const discounted: any = await gateway.call('apply_food_coupon', {
      couponCode: 'SAVE20',
      addressId: 'mock-home'
    });
    expect(discounted.data.offers.coupon_discount).toBe(25.8);
    expect(discounted.data.pricing.to_pay).toBe(141.65);
  });

  it('rejects non COD-verified coupons without changing the cart', async () => {
    await gateway.call('update_food_cart', {
      restaurantId: 'r1',
      addressId: 'mock-home',
      cartItems: [{ menuItemId: 'i2', quantity: 1 }]
    });

    await expect(gateway.call('apply_food_coupon', {
      couponCode: 'CARD100',
      addressId: 'mock-home'
    })).rejects.toThrow('Coupon not supported.');

    const cart: any = await gateway.call('get_food_cart', { addressId: 'mock-home' });
    expect(cart.data.offers.coupon_discount).toBe(0);
  });

  it('rejects an unavailable address, a closed restaurant and customizable items', async () => {
    await expect(gateway.call('search_menu', { addressId: 'real-address' }))
      .rejects.toThrow('Choose a saved address first.');

    await expect(gateway.call('update_food_cart', {
      restaurantId: 'r6', addressId: 'mock-home', cartItems: [{ menuItemId: 'i15', quantity: 1 }]
    })).rejects.toThrow('Restaurant is closed.');

    await expect(gateway.call('update_food_cart', {
      restaurantId: 'r5', addressId: 'mock-home', cartItems: [{ menuItemId: 'i14', quantity: 1 }]
    })).rejects.toThrow('Item unavailable or requires customization.');
  });

  it('enforces item stock and quantity limits before changing the cart', async () => {
    await expect(gateway.call('update_food_cart', {
      restaurantId: 'r4', addressId: 'mock-home', cartItems: [{ menuItemId: 'i12', quantity: 1 }]
    })).rejects.toThrow('Item unavailable or requires customization.');

    await expect(gateway.call('update_food_cart', {
      restaurantId: 'r1', addressId: 'mock-home', cartItems: [{ menuItemId: 'i2', quantity: 11 }]
    })).rejects.toThrow('Invalid quantity.');
  });

  it('clears the active cart when asked', async () => {
    await gateway.call('update_food_cart', {
      restaurantId: 'r1', addressId: 'mock-home', cartItems: [{ menuItemId: 'i2', quantity: 1 }]
    });

    expect(await gateway.call('flush_food_cart', {})).toEqual({ success: true });
    const cart: any = await gateway.call('get_food_cart', { addressId: 'mock-home' });
    expect(cart.data).toMatchObject({ cart_id: undefined, item_count: 0, items: [] });
    expect(cart.data.pricing.to_pay).toBe(0);
  });
});
