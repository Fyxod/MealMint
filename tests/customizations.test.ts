import { describe, expect, it } from 'vitest';
import {
  customizationDetails, selectCustomizations, selectionPayload,
  sameChoices, variantsMatch, selectionsMatch, validateCartAddons,
} from '../src/customizations.js';

// Entirely synthetic catalogue and cart fixtures; no account/menu data.
const modernItem = () => ({
  hasVariants: true, hasAddons: true,
  variantsV2: [{ groupId: 'size', name: 'Size', variations: [
    { id: 'small', name: 'Small', price: 100, inStock: 1, default: 1 },
    { id: 'large', name: 'Large', price: 150, inStock: 1 },
    { id: 'sold-out', name: 'Sold out', price: 200, inStock: 0 },
  ] }],
  addons: [{ groupId: 'sauce', groupName: 'Sauce', minAddons: 1, maxAddons: 2,
    choices: [{ id: 'mint', name: 'Mint', price: 10 }, { id: 'tomato', name: 'Tomato', price: 15 }, { id: 'hot', name: 'Hot', price: 20 }] }],
});
const size = (choiceId = 'small') => ({ groupId: 'size', choiceId });
const sauce = (choiceId = 'mint') => ({ groupId: 'sauce', choiceId });
const selection = () => selectCustomizations(customizationDetails(modernItem()), [size()], [sauce()]);

describe('synthetic customization contract', () => {
  it('normalizes modern variants, required add-ons, defaults and stock without guessing selected prices', () => {
    const details = customizationDetails(modernItem());
    expect(details.format).toBe('variantsV2');
    expect(details.variants[0]).toMatchObject({ id: 'size', min: 1, max: 1 });
    expect(details.variants[0].choices[0]).toMatchObject({ id: 'small', available: true, isDefault: true, price: 100 });
    expect(details.variants[0].choices[2].available).toBe(false);
    expect(details.addons[0]).toMatchObject({ min: 1, max: 2 });
    expect(selectionPayload(selection())).toEqual({ variantsV2: [{ group_id: 'size', variation_id: 'small' }], addons: [{ group_id: 'sauce', choice_id: 'mint' }] });
    expect(selectionPayload(selection(), false)).toEqual({ variantsV2: [{ group_id: 'size', variation_id: 'small' }] });
  });

  it('groups legacy flat variants and sends only the observed legacy format', () => {
    const details = customizationDetails({ hasVariants: true, variations: [
      { groupId: 11, groupName: 'Bread', id: 21, name: 'White', inStock: true },
      { groupId: 11, groupName: 'Bread', id: 22, name: 'Brown', inStock: true },
      { groupId: 12, groupName: 'Size', id: 23, name: 'Regular', inStock: true },
    ] });
    expect(details.variants).toHaveLength(2);
    const configured = selectCustomizations(details, [{ groupId: '12', choiceId: '23' }, { groupId: '11', choiceId: '22' }], []);
    expect(selectionPayload(configured)).toEqual({ variants: [{ group_id: '11', variation_id: '22' }, { group_id: '12', variation_id: '23' }] });
  });

  it.each([
    [[], [sauce()], /Size/],
    [[size(), size('large')], [sauce()], /Size/],
    [[size()], [], /Sauce/],
    [[size()], [sauce(), sauce('tomato'), sauce('hot')], /Sauce/],
    [[size('sold-out')], [sauce()], /unavailable/],
    [[size('invented')], [sauce()], /unavailable/],
    [[{ groupId: 'invented', choiceId: 'small' }], [sauce()], /unavailable/],
    [[size()], [sauce(), sauce()], /once/],
  ])('rejects missing, excessive, unavailable, unknown and duplicate selections (%#)', (variants, addons, error) => {
    expect(() => selectCustomizations(customizationDetails(modernItem()), variants as any, addons as any)).toThrow(error as RegExp);
  });

  it.each([0, -1, undefined])('supports the documented unlimited add-on maximum %s', maxAddons => {
    const item = modernItem();
    item.addons[0].maxAddons = maxAddons as any;
    const details = customizationDetails(item);
    expect(details.addons[0].max).toBeNull();
    expect(selectCustomizations(details, [size()], [sauce(), sauce('tomato'), sauce('hot')]).addons).toHaveLength(3);
  });

  it('rejects mixed, incomplete, ambiguous and internally impossible menus', () => {
    expect(() => customizationDetails({ ...modernItem(), variations: [{ groupId: 'old', id: 'legacy' }] })).toThrow(/format/);
    expect(() => customizationDetails({ hasVariants: true })).toThrow(/complete/);
    expect(() => customizationDetails({ hasAddons: true })).toThrow(/complete/);
    const duplicate = modernItem();
    duplicate.variantsV2[0].variations.push(duplicate.variantsV2[0].variations[0]);
    expect(() => customizationDetails(duplicate)).toThrow(/Ambiguous/);
    const invalid = modernItem();
    invalid.addons[0].maxAddons = 1;
    invalid.addons[0].minAddons = 2;
    expect(() => customizationDetails(invalid)).toThrow(/limits/);
  });

  it('matches choices exactly while permitting unambiguous omitted cart group IDs', () => {
    const selected = selection();
    expect(selectionsMatch(selected, { variants: [{ variation_id: 'small' }], addons: [{ choiceId: 'mint' }] })).toBe(true);
    expect(variantsMatch(selected, { variantsV2: [{ groupId: 'size', variationId: 'large' }] })).toBe(false);
    expect(selectionsMatch(selected, { variants: [{ id: 'small' }], addons: [] })).toBe(false);
    expect(selectionsMatch(selected, { variants: [{ id: 'small' }], addons: [{ id: 'mint' }, { id: 'tomato' }] })).toBe(false);
    expect(selectionsMatch(selected, { variants: [{ id: 'small' }], addons: [{ group_id: 'wrong', id: 'mint' }] })).toBe(false);
    expect(sameChoices([size(), sauce()], [sauce(), size()])).toBe(true);
    expect(sameChoices([size()], [size(), size()])).toBe(false);
  });

  it('rejects ambiguous group omission rather than assigning a choice to an arbitrary group', () => {
    const selected = { format: 'variants' as const, variants: [{ groupId: 'a', choiceId: 'shared' }, { groupId: 'b', choiceId: 'shared' }], addons: [], summary: [] };
    expect(variantsMatch(selected, { variants: [{ id: 'shared' }, { id: 'shared' }] })).toBe(false);
  });

  it('checks add-ons against the fresh variant-specific cart rather than the original menu alone', () => {
    expect(() => validateCartAddons(selection(), modernItem().addons)).not.toThrow();
    expect(() => validateCartAddons(selection(), undefined)).toThrow(/could not be verified/);
    expect(() => validateCartAddons(selection(), [])).toThrow(/unavailable/);
    const variantSpecific = modernItem().addons;
    variantSpecific[0].choices = [{ id: 'tomato', name: 'Tomato', price: 15 }];
    expect(() => validateCartAddons(selection(), variantSpecific)).toThrow(/unavailable/);
  });
});

// Synthetic flattened meal menu: each zero-price fixed choice identifies a
// possible variant; the side groups describe alternatives, not all required extras.
function flattenedMenu() {
  return { ...modernItem(), addons: [
    { groupId: 'fixed-burger', groupName: 'Item', minAddons: 1, maxAddons: 1,
      choices: [{ id: 'selected-burger', name: 'Selected burger', price: 0, inStock: 1 }] },
    { groupId: 'fixed-meal', groupName: 'Item', minAddons: 1, maxAddons: 1,
      choices: [{ id: 'selected-meal', name: 'Selected meal', price: 0, inStock: 1 }] },
    { groupId: 'drink', groupName: 'Meal drink', minAddons: 1, maxAddons: 1,
      choices: [{ id: 'water', name: 'Water', price: 10, inStock: 1 }] },
    { groupId: 'side', groupName: 'Meal side', minAddons: 1, maxAddons: 1,
      choices: [{ id: 'fries', name: 'Fries', price: 20, inStock: 1 }] },
  ] };
}

describe('synthetic fixed variant bootstrap choices', () => {
  it('hides only structural fixed groups and preserves conditional minimums without demanding every meal extra', () => {
    const details = customizationDetails(flattenedMenu());
    expect(details.bootstrap).toEqual([{ groupId: 'fixed-burger', choiceId: 'selected-burger' }, { groupId: 'fixed-meal', choiceId: 'selected-meal' }]);
    expect(details.addons.map(x => x.id)).toEqual(['drink', 'side']);
    expect(details.addons.map(x => ({ min: x.min, conditionalMin: x.conditionalMin, max: x.max }))).toEqual([
      { min: 0, conditionalMin: 1, max: 1 }, { min: 0, conditionalMin: 1, max: 1 },
    ]);
    const selected = selectCustomizations(details, [size()], []);
    expect(selected.bootstrap).toEqual(details.bootstrap);
    expect(selected.addons).toEqual([]);
    expect(() => validateCartAddons(selected, flattenedMenu().addons)).not.toThrow();
  });

  it('allows only explicitly approved bootstrap references in the returned cart', () => {
    const selected = selectCustomizations(customizationDetails(flattenedMenu()), [size()], []);
    const cart = { variantsV2: [{ group_id: 'size', variation_id: 'small' }], addons: [{ group_id: 'fixed-burger', choice_id: 'selected-burger' }] };
    expect(selectionsMatch(selected, cart)).toBe(true);
    expect(selectionsMatch(selected, { ...cart, addons: [...cart.addons, { group_id: 'drink', choice_id: 'water' }] })).toBe(false);
    expect(selectionsMatch(selected, { ...cart, addons: [{ group_id: 'fixed-burger', choice_id: 'unapproved' }] })).toBe(false);
    expect(selectionsMatch(selected, { ...cart, addons: [{ group_id: 'foreign-group', choice_id: 'selected-burger' }] })).toBe(false);
  });

  it.each(['paid', 'optional', 'not-selected', 'unavailable', 'no-variants'])('does not hide a normal %s add-on as a structural seed', kind => {
    const menu: any = flattenedMenu();
    menu.addons = [menu.addons[0], menu.addons[2]];
    if (kind === 'paid') menu.addons[0].choices[0].price = 1;
    if (kind === 'optional') menu.addons[0].minAddons = 0;
    if (kind === 'not-selected') menu.addons[0].choices[0].name = 'Extra sauce';
    if (kind === 'unavailable') menu.addons[0].choices[0].inStock = 0;
    if (kind === 'no-variants') { menu.hasVariants = false; menu.variantsV2 = []; }
    const details = customizationDetails(menu);
    expect(details.bootstrap).toBeUndefined();
    expect(details.addons.map(x => x.id)).toContain('fixed-burger');
    expect(details.addons.find(x => x.id === 'drink')?.min).toBe(1);
  });

  it('accepts a complete variant menu containing only structural fixed choices and no optional extras', () => {
    const menu = flattenedMenu();
    menu.addons = menu.addons.slice(0, 2);
    const details = customizationDetails(menu);
    expect(details.addons).toEqual([]);
    expect(details.bootstrap).toHaveLength(2);
    expect(selectCustomizations(details, [size()], []).addons).toEqual([]);
  });

  it('rejects duplicate structural groups so fixed-choice retries cannot repeat an identical payload', () => {
    const menu = flattenedMenu();
    menu.addons[1] = structuredClone(menu.addons[0]);
    expect(() => customizationDetails(menu)).toThrow(/Ambiguous/);
  });

  it('bounds fixed alternatives to three before any writes are possible', () => {
    const menu = flattenedMenu();
    menu.addons = Array.from({ length: 4 }, (_, i) => ({ ...menu.addons[0], groupId: `fixed-${i}` }));
    expect(() => customizationDetails(menu)).toThrow(/Unsupported fixed/);
  });
});

describe('synthetic selected-group base-item recognition', () => {
  function menu() {
    return { ...modernItem(), name: 'Synthetic Makhani Burger', addons: [
      { groupId: 'base-item', groupName: 'Selected burger', minAddons: 1, maxAddons: 1,
        choices: [{ id: 'makhani', name: 'Synthetic Makhani Burger', price: 0, inStock: 1 }] },
      { groupId: 'drink', groupName: 'Selected beverage', minAddons: 1, maxAddons: 1,
        choices: [{ id: 'coke', name: 'Coke', price: 0, inStock: 1 }] },
    ] };
  }
  it('recognizes a Selected group whose single zero-price choice is the actual base dish', () => {
    const details = customizationDetails(menu());
    expect(details.bootstrap).toEqual([{ groupId: 'base-item', choiceId: 'makhani' }]);
    expect(details.addons.map(group => group.id)).toEqual(['drink']);
    const selected = selectCustomizations(details, [size()], []);
    const cart = { variants: [{ group_id: 'size', variation_id: 'small' }], addons: [{ group_id: 'base-item', choice_id: 'makhani' }] };
    expect(selectionsMatch(selected, cart)).toBe(true);
    expect(selectionsMatch(selected, { ...cart, addons: [...cart.addons, { group_id: 'drink', choice_id: 'coke' }] })).toBe(false);
  });
  it('normalizes case, spaces and punctuation when matching the structural choice to the base dish', () => {
    const fixture = menu();
    fixture.addons[0].choices[0].name = 'SYNTHETIC Makhani-Burger!';
    expect(customizationDetails(fixture).bootstrap).toEqual([{ groupId: 'base-item', choiceId: 'makhani' }]);
  });
  it.each(['different-name', 'not-selected-group', 'paid'])('keeps a %s group as an explicit choice', kind => {
    const fixture = menu();
    if (kind === 'different-name') fixture.addons[0].choices[0].name = 'Synthetic Makhani Burger Meal';
    if (kind === 'not-selected-group') fixture.addons[0].groupName = 'Choose burger';
    if (kind === 'paid') fixture.addons[0].choices[0].price = 5;
    const details = customizationDetails(fixture);
    expect(details.bootstrap).toBeUndefined();
    expect(details.addons.map(group => group.id)).toEqual(['base-item', 'drink']);
  });
});
