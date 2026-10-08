import { describe, expect, it } from 'vitest';
import { cartFingerprint, cartReceiptFingerprint } from '../src/cart.js';

// Synthetic cart receipt fixtures. No account or provider data.
const cart = () => ({ data: {
  restaurant: { deliverySubtitle: 'Synthetic district' },
  items: [{ menu_item_id: 'synthetic-item', quantity: 2, in_stock: 0, total: 200, final_price: 100,
    variants: [{ group_id: 'size', variation_id: 'small' }],
    addons: [{ group_id: 'extras', choice_id: 'cheese' }],
    valid_addons: [{ groupId: 'extras', choices: [{ id: 'cheese', name: 'Cheese', price: 10 }] }],
  }],
  offers: { coupon_applied: null, coupon_discount: 0 }, pricing: { to_pay: 220, item_total: 200 },
} });

describe('cart receipts versus concurrency fingerprints', () => {
  it('ignores unselected catalog churn in both receipt and concurrency checks', () => {
    const before = cart(), after = cart();
    after.data.items[0].valid_addons[0].choices = [{ id: 'new-option', name: 'Different unselected topping', price: 45 }];
    expect(cartReceiptFingerprint(before, 'synthetic-r')).toBe(cartReceiptFingerprint(after, 'synthetic-r'));
    expect(cartFingerprint(before)).toBe(cartFingerprint(after));
  });

  it.each(['item', 'quantity', 'stock', 'price', 'addon', 'variant', 'coupon', 'payable', 'restaurant'])('detects selected cart %s changes in both concurrency and receipt checks', change => {
    const before = cart(), after: any = cart();
    if (change === 'item') after.data.items[0].menu_item_id = 'different-item';
    if (change === 'restaurant') after.data.restaurant = { id: 'different-restaurant' };
    if (change === 'quantity') after.data.items[0].quantity = 3;
    if (change === 'stock') after.data.items[0].in_stock = 1;
    if (change === 'price') after.data.items[0].final_price = 101;
    if (change === 'addon') after.data.items[0].addons[0].choice_id = 'sauce';
    if (change === 'variant') after.data.items[0].variants[0].variation_id = 'large';
    if (change === 'coupon') after.data.offers.coupon_applied = 'EXTERNAL';
    if (change === 'payable') after.data.pricing.to_pay = 221;
    expect(cartReceiptFingerprint(before, 'synthetic-r')).not.toBe(cartReceiptFingerprint(after, 'synthetic-r'));
    expect(cartFingerprint(before)).not.toBe(cartFingerprint(after));
  });

  it('binds a missing restaurant identity to the write request and preserves explicit identity disagreement', () => {
    const missing = cart(), explicit: any = cart();
    explicit.data.restaurant = { id: 'synthetic-r' };
    expect(cartReceiptFingerprint(missing, 'synthetic-r')).toBe(cartReceiptFingerprint(explicit, 'synthetic-r'));
    expect(cartReceiptFingerprint(missing, '')).not.toBe(cartReceiptFingerprint(missing, 'synthetic-r'));
    explicit.data.restaurant.id = 'other-restaurant';
    expect(cartReceiptFingerprint(explicit, 'synthetic-r')).not.toBe(cartReceiptFingerprint(missing, 'synthetic-r'));
  });
});
