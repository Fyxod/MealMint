import { describe, expect, it } from 'vitest';
import { couponCode } from '../src/coupons.js';

// Synthetic coupon catalogue fixtures, including gateway-style identifier/code distinctions.
const uuid = 'd346a36a-1122-4cd0-b2a0-bb4433667788';

describe('coupon code extraction', () => {
  it('prefers an explicit valid code over descriptive hints and opaque identifiers', () => {
    expect(couponCode({ id: uuid, code: 'EXPLICIT20', title: 'TITLE50', description: 'Use code DESCRIPTION30 to save' })).toBe('EXPLICIT20');
  });

  it('uses the advertised redeemable code instead of the gateway UUID', () => {
    expect(couponCode({ id: uuid, title: 'FLAT75', description: 'Use code FLAT75 & get 75 off' })).toBe('FLAT75');
  });

  it('prioritizes an explicit Use code instruction over a similar marketing title', () => {
    expect(couponCode({ id: uuid, title: 'CELEBRATIONS', description: 'Use code CELEBRATION & get a discount' })).toBe('CELEBRATION');
  });

  it('extracts a code without carrying punctuation or surrounding descriptive words into the call', () => {
    expect(couponCode({ id: uuid, description: 'Use code SAVE20, valid on eligible orders.' })).toBe('SAVE20');
  });

  it('can use a code-like title when no explicit description code exists', () => {
    expect(couponCode({ id: uuid, title: 'FLAT75' })).toBe('FLAT75');
  });

  it('preserves synthetic and legacy code-like IDs when no better code evidence exists', () => {
    expect(couponCode({ id: 'SAVE20', title: 'Save on a meal' })).toBe('SAVE20');
    expect(couponCode({ id: 'THRESHOLD80', title: 'Synthetic 80 off at 200' })).toBe('THRESHOLD80');
  });

  it('never turns a UUID identifier into a redeemable coupon code', () => {
    expect(couponCode({ id: uuid })).toBeNull();
    expect(couponCode({ id: uuid, title: 'A great deal for you', description: 'Discount may be available.' })).toBeNull();
  });

  it('rejects missing data and human-facing titles that are not code tokens', () => {
    expect(couponCode({})).toBeNull();
    expect(couponCode({ title: 'Flat 75 off' })).toBeNull();
    expect(couponCode({ title: '75% OFF!' })).toBeNull();
    expect(couponCode({ id: 12345 })).toBeNull();
  });
});
