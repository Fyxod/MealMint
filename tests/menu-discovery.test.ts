import { describe, expect, it } from 'vitest';
import { menuItems, menuTruncated } from '../src/menu.js';
import { FoodService } from '../src/service.js';
import type { AgentProvider, FoodGateway } from '../src/types.js';

// Synthetic menu, restaurant and address fixtures only. No live provider calls.
const item = (id: string | number, name: string, price: number) => ({ id, name, price, inStock: 1, isVeg: true });
const nestedMenu = () => ({
  items: [item('top', 'Synthetic top-level burger', 59)],
  categories: [
    { title: 'Synthetic category', items: [item('direct', 'Synthetic fries', 45)], subcategories: [
      { title: 'Synthetic nested category', items: [item('regular', 'Synthetic burger', 70), item('discounted', 'Synthetic burger', 59)], subcategories: [
        { title: 'Synthetic deeply nested category', items: [item('deep', 'Synthetic deep menu item', 90)] },
      ] },
    ] },
  ],
});

describe('synthetic recursive menu discovery', () => {
  it('includes top-level, category and recursively nested subcategory items together', () => {
    const raw = nestedMenu();
    expect(menuItems(raw).map((entry: any) => entry.id)).toEqual(['top', 'direct', 'regular', 'discounted', 'deep']);
    expect(raw.categories[0].subcategories[0].subcategories[0].items).toHaveLength(1);
  });

  it('deduplicates equivalent numeric/string identifiers while retaining distinct same-name SKUs', () => {
    const raw = { items: [item(42, 'Synthetic first copy', 59), item('regular', 'Synthetic burger', 70)], categories: [
      { items: [{ menu_item_id: '42', name: 'Synthetic duplicate', price: 500 }, item('discounted', 'Synthetic burger', 59)],
        subcategories: [{ items: [item('regular', 'Synthetic duplicate regular', 70)] }] },
    ] };
    const result = menuItems(raw);
    expect(result).toHaveLength(3);
    expect(result.map((entry: any) => String(entry.id ?? entry.menu_item_id))).toEqual(['42', 'regular', 'discounted']);
    expect(result[0].price).toBe(59);
    expect(result.filter((entry: any) => entry.name === 'Synthetic burger')).toHaveLength(2);
  });

  it('uses canonical menu_item_id ahead of id consistently with search registration and cart writes', () => {
    // menu_item_id is the gateway's canonical write identifier; id is a fallback.
    const raw = { items: [{ ...item('fallback', 'Synthetic canonical', 70), menu_item_id: 'canonical' }], categories: [
      { items: [item('canonical', 'Synthetic duplicate', 70), item('fallback', 'Synthetic separate item', 50)] },
    ] };
    expect(menuItems(raw).map((entry: any) => entry.menu_item_id ?? entry.id)).toEqual(['canonical', 'fallback']);
    expect(menuItems(raw).map((entry: any) => entry.name)).toEqual(['Synthetic canonical', 'Synthetic separate item']);
  });

  it.each([
    { truncated: true },
    { hasMore: true },
    { categories: [{ hasMoreItems: true }] },
    { categories: [{ subcategories: [{ subcategories: [{ hasMoreItems: true }] }] }] },
  ])('reports incomplete coverage at every supported depth (%#)', raw => {
    expect(menuTruncated(raw)).toBe(true);
  });

  it('does not invent truncated coverage for fully returned nested categories', () => {
    expect(menuTruncated({ ...nestedMenu(), truncated: false, hasMore: false })).toBe(false);
    expect(menuItems({ items: [], categories: [] })).toEqual([]);
    expect(menuTruncated({ items: [], categories: [] })).toBe(false);
  });
});

class SyntheticDiscoveryGateway implements FoodGateway {
  readonly mode = 'mock' as const;
  calls: { name: string; args: Record<string, any> }[] = [];
  restaurantState: Record<string, unknown> = { isOpen: true };
  pageMenu: any = nestedMenu();
  scopedItems: any[] = [item('scoped', 'Synthetic scoped burger', 65)];
  hasMore = false;
  nextOffset: number | undefined;
  async close() {}
  async call(name: string, args: Record<string, any>): Promise<any> {
    this.calls.push({ name, args: structuredClone(args) });
    if (name === 'get_addresses') return [{ id: 'synthetic-home', label: 'Synthetic home', display: 'Synthetic district' }];
    if (name === 'search_restaurants') return {
      restaurants: [{ id: 'synthetic-r', name: 'Synthetic kitchen', availabilityStatus: 'OPEN', deliveryTimeMinutes: 20 }],
      dishes: [{ ...item('anchor', 'Synthetic seed dish', 50), restaurantId: 'synthetic-r' }],
    };
    if (name === 'get_restaurant_menu') return {
      ...this.pageMenu,
      restaurant: { id: 'synthetic-r', name: 'Synthetic kitchen', deliveryTime: 20, ...this.restaurantState },
      page: args.page ?? 1,
    };
    if (name === 'search_menu') return { items: this.scopedItems, hasMore: this.hasMore, nextOffset: this.nextOffset };
    throw new Error(`Unexpected synthetic discovery call: ${name}`);
  }
}
const idleAgent: AgentProvider = {
  async status() { return { connected: true, provider: 'synthetic-test' }; },
  async turn() { return 'Synthetic reply'; }, async cancel() {}, async close() {},
};
async function ready(budget = 200) {
  const gateway = new SyntheticDiscoveryGateway();
  const service = new FoodService(gateway, idleAgent);
  const conversation = service.create();
  await service.selectAddress(conversation.id, 'synthetic-home');
  service.updatePreferences(conversation.id, { budget });
  const search = await service.dispatch(conversation.id, 'food_search', { query: 'synthetic seed' });
  const candidate = search.candidates[0];
  gateway.calls = [];
  return { gateway, service, conversation, candidate };
}

describe('FoodService observed restaurant menu discovery', () => {
  it('discovers both regular and discounted same-name items hidden inside nested menu categories', async () => {
    const { gateway, service, conversation, candidate } = await ready();
    const result = await service.dispatch(conversation.id, 'food_menu', { candidateId: candidate.id });
    expect(result.candidates.map((entry: any) => entry.itemId)).toEqual(expect.arrayContaining(['top', 'direct', 'regular', 'discounted', 'deep']));
    expect(result.candidates.filter((entry: any) => entry.name === 'Synthetic burger')).toHaveLength(2);
    expect(gateway.calls).toEqual([{ name: 'get_restaurant_menu', args: { addressId: 'synthetic-home', restaurantId: 'synthetic-r' } }]);
  });

  it('surfaces nested incompleteness and forwards page selection without claiming complete coverage', async () => {
    const { gateway, service, conversation, candidate } = await ready();
    gateway.pageMenu.categories[0].subcategories[0].subcategories[0].hasMoreItems = true;
    const nested = await service.dispatch(conversation.id, 'food_menu', { candidateId: candidate.id, page: 2 });
    expect(nested.truncated).toBe(true);
    expect(gateway.calls[0].args.page).toBe(2);
    gateway.pageMenu.hasMore = true;
    const paginated = await service.dispatch(conversation.id, 'food_menu', { candidateId: candidate.id, page: 3 });
    expect(paginated.nextPage).toBe(4);
  });

  it.each([false, true])('admits above-budget menu hypotheses only when includePotentialDeals is explicit (%s)', async includePotentialDeals => {
    const { gateway, service, conversation, candidate } = await ready(100);
    gateway.pageMenu = { categories: [{ subcategories: [{ items: [item('above', 'Synthetic threshold bundle', 150)] }] }] };
    const result = await service.dispatch(conversation.id, 'food_menu', { candidateId: candidate.id, ...(includePotentialDeals ? { includePotentialDeals: true } : {}) });
    if (includePotentialDeals) expect(result.candidates).toEqual([expect.objectContaining({ itemId: 'above', price: 150, dealHypothesis: true })]);
    else expect(result.candidates).toEqual([]);
    expect(gateway.calls.some(call => /update_food_cart|apply_food_coupon|flush_food_cart/.test(call.name))).toBe(false);
  });

  it('does not expose menu candidates when fresh restaurant metadata says closed', async () => {
    const { gateway, service, conversation, candidate } = await ready();
    gateway.restaurantState = { isOpen: false, availabilityStatus: 'CLOSED' };
    const result = await service.dispatch(conversation.id, 'food_menu', { candidateId: candidate.id });
    expect(result.candidates).toEqual([]);
  });
});

describe('FoodService scoped dish searches', () => {
  it('scopes a dish query to an observed restaurant and freshly verifies its menu before search', async () => {
    const { gateway, service, conversation, candidate } = await ready();
    const result = await service.dispatch(conversation.id, 'food_search', { candidateId: candidate.id, query: 'synthetic burger' });
    expect(result.candidates).toEqual([expect.objectContaining({ itemId: 'scoped', restaurantId: 'synthetic-r', name: 'Synthetic scoped burger' })]);
    expect(gateway.calls.map(call => call.name)).toEqual(['get_restaurant_menu', 'search_menu']);
    expect(gateway.calls[0].args).toMatchObject({ addressId: 'synthetic-home', restaurantId: 'synthetic-r', page: 1 });
    expect(gateway.calls[1].args).toMatchObject({ addressId: 'synthetic-home', restaurantIdOfAddedItem: 'synthetic-r', query: 'synthetic burger' });
    expect(gateway.calls.some(call => call.name === 'search_restaurants')).toBe(false);
  });

  it.each(['restaurantId', 'restaurant_id'])('does not overwrite an explicitly conflicting %s on scoped search results', async field => {
    const { gateway, service, conversation, candidate } = await ready();
    gateway.scopedItems = [{ ...item('foreign', 'Synthetic item from another restaurant', 40), [field]: 'foreign-restaurant' }, item('scoped', 'Synthetic scoped burger', 65)];
    const result = await service.dispatch(conversation.id, 'food_search', { candidateId: candidate.id, query: 'burger' });
    expect(result.candidates.map((entry: any) => entry.itemId)).toEqual(['scoped']);
    expect(result.candidates[0].restaurantId).toBe('synthetic-r');
  });

  it('rejects an invented scope handle before any gateway request', async () => {
    const { gateway, service, conversation } = await ready();
    await expect(service.dispatch(conversation.id, 'food_search', { candidateId: 'invented-handle', query: 'burger' })).rejects.toThrow(/Unknown candidate/);
    expect(gateway.calls).toEqual([]);
  });

  it.each([
    { isOpen: false },
    { availabilityStatus: 'CLOSED' },
    { isOpen: false, availabilityStatus: 'OPEN' },
  ])('stops scoped searches on fresh closed restaurant evidence (%#)', async restaurantState => {
    const { gateway, service, conversation, candidate } = await ready();
    gateway.restaurantState = restaurantState;
    await expect(service.dispatch(conversation.id, 'food_search', { candidateId: candidate.id, query: 'burger' })).rejects.toThrow(/closed|available|open/i);
    expect(gateway.calls.map(call => call.name)).toEqual(['get_restaurant_menu']);
  });

  it.each([false, true])('requires explicit potential-deal admission for above-budget scoped results (%s)', async includePotentialDeals => {
    const { gateway, service, conversation, candidate } = await ready(100);
    gateway.scopedItems = [item('large', 'Synthetic larger threshold item', 150)];
    const result = await service.dispatch(conversation.id, 'food_search', { candidateId: candidate.id, query: 'threshold', ...(includePotentialDeals ? { includePotentialDeals: true } : {}) });
    if (includePotentialDeals) expect(result.candidates).toEqual([expect.objectContaining({ itemId: 'large', price: 150, dealHypothesis: true })]);
    else expect(result.candidates).toEqual([]);
  });

  it('forwards a scoped offset and returns continuation without switching to global restaurant search', async () => {
    const { gateway, service, conversation, candidate } = await ready();
    gateway.hasMore = true;
    gateway.nextOffset = 50;
    const result = await service.dispatch(conversation.id, 'food_search', { candidateId: candidate.id, query: 'burger', offset: 25 });
    expect(result).toMatchObject({ hasMore: true, nextOffset: 50 });
    expect(gateway.calls[1].args).toMatchObject({ restaurantIdOfAddedItem: 'synthetic-r', offset: 25 });
    expect(gateway.calls.some(call => call.name === 'search_restaurants')).toBe(false);
    gateway.hasMore = false;
    gateway.nextOffset = undefined;
    await service.dispatch(conversation.id, 'food_search', { candidateId: candidate.id, query: 'burger', offset: 50 });
    expect(gateway.calls.filter(call => call.name === 'get_restaurant_menu')).toHaveLength(2);
    expect(gateway.calls.at(-1)?.args.offset).toBe(50);
  });
});
