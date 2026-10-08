import { describe, expect, it } from 'vitest';
import { cartPlanItems, cartPlanLabel } from '../src/plans.js';
import type { Candidate } from '../src/types.js';

// Synthetic plan fixtures: quantities represent menu units, not people/servings.
function dish(): Candidate {
  return { id: 'synthetic-option', itemId: 'burger', name: 'Synthetic burger', restaurantId: 'synthetic-r', restaurant: 'Synthetic kitchen',
    price: 70, isVeg: true, eta: 20, rating: 4, available: true, customizable: false, offer: null, source: 'mock' };
}
function tripleBurger(): Candidate {
  return { ...dish(), id: 'synthetic-bundle', name: '3 × Synthetic burger', price: 210,
    lines: [{ itemId: 'burger', name: 'Synthetic burger', quantity: 3 }] };
}

describe('exact final cart quantities', () => {
  it('shows nine burgers when a three-burger bundle is repeated three times', () => {
    expect(cartPlanItems(tripleBurger(), 3)).toEqual([{ itemId: 'burger', name: 'Synthetic burger', quantity: 9 }]);
    expect(cartPlanLabel(tripleBurger(), 3)).toBe('9 × Synthetic burger');
  });

  it('shows three burgers when a three-burger bundle is requested once', () => {
    expect(cartPlanItems(tripleBurger(), 1)).toEqual([{ itemId: 'burger', name: 'Synthetic burger', quantity: 3 }]);
    expect(cartPlanLabel(tripleBurger(), 1)).toBe('3 × Synthetic burger');
  });

  it.each([1, 3])('shows the actual count for an unbundled dish with multiplier %s', count => {
    expect(cartPlanItems(dish(), count)).toEqual([{ itemId: 'burger', name: 'Synthetic burger', quantity: count }]);
    expect(cartPlanLabel(dish(), count)).toBe(`${count} × Synthetic burger`);
  });

  it('keeps exact frozen mixed-line counts independent of later source-plan edits', () => {
    const plan = { ...dish(), lines: [{ itemId: 'burger', name: 'Synthetic burger', quantity: 2 }, { itemId: 'fries', name: 'Synthetic fries', quantity: 1 }] };
    const frozen = structuredClone(plan);
    plan.lines[0].quantity = 5;
    plan.lines[1].name = 'Changed name';
    expect(cartPlanItems(frozen, 2)).toEqual([
      { itemId: 'burger', name: 'Synthetic burger', quantity: 4 },
      { itemId: 'fries', name: 'Synthetic fries', quantity: 2 },
    ]);
    expect(cartPlanLabel(frozen, 2)).toBe('4 × Synthetic burger + 2 × Synthetic fries');
    expect(frozen.lines[0].quantity).toBe(2);
  });

  it('keeps differently configured lines of the same dish distinct', () => {
    const plan = { ...dish(), lines: [{ itemId: 'burger', name: 'Synthetic burger (Small)', quantity: 1 }, { itemId: 'burger', name: 'Synthetic burger (Large)', quantity: 2 }] };
    expect(cartPlanItems(plan, 2)).toEqual([
      { itemId: 'burger', name: 'Synthetic burger (Small)', quantity: 2 },
      { itemId: 'burger', name: 'Synthetic burger (Large)', quantity: 4 },
    ]);
    expect(cartPlanLabel(plan, 2)).toBe('2 × Synthetic burger (Small) + 4 × Synthetic burger (Large)');
  });
});
