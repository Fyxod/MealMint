import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  client: {
    connect: vi.fn(),
    listTools: vi.fn(),
    callTool: vi.fn(),
    close: vi.fn()
  },
  Client: vi.fn(),
  Transport: vi.fn()
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: sdk.Client }));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: sdk.Transport
}));

import { LiveFoodGateway, SwiggyResponseError } from '../src/food.js';
import { cartReceiptFingerprint } from '../src/cart.js';

const officialTools = [
  'get_addresses', 'search_restaurants', 'search_menu', 'get_restaurant_menu',
  'fetch_food_coupons', 'get_food_cart', 'update_food_cart', 'apply_food_coupon', 'flush_food_cart'
].map(name => ({ name }));

function gateway(token: () => Promise<string | null> = async () => 'synthetic-access-token') {
  return new LiveFoodGateway('https://mcp.swiggy.com/food', token);
}

describe('LiveFoodGateway', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sdk.Client.mockImplementation(function ClientStub() { return sdk.client; });
    sdk.Transport.mockImplementation(function TransportStub(url: URL, init: unknown) { return { url, init }; });
    sdk.client.connect.mockResolvedValue(undefined);
    sdk.client.listTools.mockResolvedValue({ tools: officialTools });
    sdk.client.close.mockResolvedValue(undefined);
    sdk.client.callTool.mockResolvedValue({
      structuredContent: { success: true, data: { ready: true } },
      content: [],
      isError: false
    });
  });

  it('accepts the official production and staging Food endpoints only', () => {
    expect(() => new LiveFoodGateway('https://mcp.swiggy.com/food', async () => null)).not.toThrow();
    expect(() => new LiveFoodGateway('https://mcp-staging.swiggy.com/food', async () => null)).not.toThrow();
    expect(() => new LiveFoodGateway('http://mcp.swiggy.com/food', async () => null)).toThrow('Use an official Swiggy Food endpoint.');
    expect(() => new LiveFoodGateway('https://example.test/food', async () => null)).toThrow('Use an official Swiggy Food endpoint.');
    expect(() => new LiveFoodGateway('https://mcp.swiggy.com/tools', async () => null)).toThrow('Use an official Swiggy Food endpoint.');
  });

  it('blocks order and payment tools before creating a client or reading a token', async () => {
    const token = vi.fn(async () => 'synthetic-access-token');
    const live = gateway(token);

    await expect(live.call('place_order', {})).rejects.toThrow('Tool is not allowed.');
    await expect(live.call('make_payment', {})).rejects.toThrow('Tool is not allowed.');
    expect(token).not.toHaveBeenCalled();
    expect(sdk.Client).not.toHaveBeenCalled();
  });

  it('opens one authenticated session and unwraps structured results', async () => {
    sdk.client.callTool.mockResolvedValue({
      structuredContent: { success: true, data: { restaurants: ['synthetic-restaurant'] } },
      content: [],
      isError: false
    });
    const live = gateway();

    await expect(live.call('search_menu', { query: 'synthetic meal' })).resolves.toEqual({
      restaurants: ['synthetic-restaurant']
    });

    expect(sdk.Client).toHaveBeenCalledWith({ name: 'mealmint-personal-assistant', version: '0.1.0' });
    expect(sdk.Transport).toHaveBeenCalledWith(
      new URL('https://mcp.swiggy.com/food'),
      { requestInit: { headers: { Authorization: 'Bearer synthetic-access-token' } } }
    );
    expect(sdk.client.listTools).toHaveBeenCalledOnce();
    expect(sdk.client.callTool).toHaveBeenCalledWith({
      name: 'search_menu',
      arguments: { query: 'synthetic meal' }
    });
  });

  it('shares an in-flight connection between concurrent calls', async () => {
    const live = gateway();
    await Promise.all([
      live.call('get_addresses', {}),
      live.call('search_menu', { query: 'synthetic' })
    ]);

    expect(sdk.Client).toHaveBeenCalledOnce();
    expect(sdk.client.listTools).toHaveBeenCalledOnce();
    expect(sdk.client.callTool).toHaveBeenCalledTimes(2);
  });

  it('stops when the remote tool catalogue is incomplete', async () => {
    sdk.client.listTools.mockResolvedValue({ tools: officialTools.slice(0, -1) });
    const live = gateway();

    await expect(live.call('get_addresses', {})).rejects.toThrow('Swiggy request failed.');
    expect(sdk.client.close).toHaveBeenCalledOnce();
    expect(sdk.client.callTool).not.toHaveBeenCalled();
  });

  it('rejects unstructured error responses without exposing remote response contents', async () => {
    sdk.client.callTool.mockResolvedValue({
      content: [{ type: 'text', text: 'provider-secret and internal response details' }],
      isError: true
    });
    const live = gateway();

    await expect(live.call('get_addresses', {})).rejects.toThrow('Swiggy request failed.');
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it('turns expired authorization into a reconnect message and closes the session', async () => {
    const unauthorized = Object.assign(new Error('401 Bearer synthetic-secret'), { code: 401 });
    sdk.client.callTool.mockRejectedValue(unauthorized);
    const live = gateway();

    await expect(live.call('get_addresses', {})).rejects.toThrow('Swiggy authorization expired. Reconnect your account.');
    expect(sdk.client.close).toHaveBeenCalledOnce();
  });

  it('backs off on remote rate limits without retrying the failed call', async () => {
    sdk.client.callTool.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { code: 429 }));
    const live = gateway();

    await expect(live.call('search_menu', {})).rejects.toThrow('Swiggy is rate limited. Wait a minute before trying again.');
    await expect(live.call('search_menu', {})).rejects.toThrow('Swiggy is rate limited. Wait before trying again.');
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it('never retries a failed cart write automatically', async () => {
    sdk.client.callTool.mockRejectedValueOnce(new Error('synthetic transport failure'));
    const live = gateway();

    await expect(live.call('update_food_cart', { restaurantId: 'synthetic-r1' }))
      .rejects.toThrow('Swiggy request failed. Refresh and try again; writes are never retried automatically.');
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it.each([
    [{ statusCode: 1, errorCodes: ['INVALID_ADDON'] }, 'INVALID_ADDON'],
    [{ successful: false, errorCodes: ['INVALID_ADDON'] }, 'INVALID_ADDON'],
    [{ statusCode: 1, errorCodes: ['OUT_OF_STOCK'] }, 'UNAVAILABLE'],
    [{ successful: false, errorCodes: ['INVALID_ITEM'] }, 'UNAVAILABLE'],
    [{ statusCode: 1, errorCodes: ['UNRECOGNIZED_INTERNAL_CODE'] }, 'REJECTED'],
    [{ successful: false }, 'REJECTED'],
  ] as const)('sanitizes structured provider rejection %# while retaining only a typed reason', async (failure, reason) => {
    sdk.client.callTool.mockResolvedValue({ structuredContent: {
      ...failure, sid: 'synthetic-private-sid', tid: 'synthetic-private-tid',
      statusMessage: 'Raw account diagnostic synthetic-private-status',
    }, content: [], isError: false });
    const live = gateway();
    const error = await live.call('update_food_cart', { restaurantId: 'synthetic-r' }).catch(error => error);
    expect(error).toBeInstanceOf(SwiggyResponseError);
    expect(error.reason).toBe(reason);
    const exposed = [error.message, error.stack, JSON.stringify(error)].join(' ');
    expect(exposed).not.toMatch(/synthetic-private|UNRECOGNIZED_INTERNAL_CODE/);
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it('parses a text JSON rejection without exposing provider session identifiers', async () => {
    sdk.client.callTool.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({
      successful: false, errorCodes: ['INVALID_ADDON'], sid: 'synthetic-private-sid', tid: 'synthetic-private-tid',
    }) }], isError: false });
    const error = await gateway().call('update_food_cart', {}).catch(error => error);
    expect(error).toBeInstanceOf(SwiggyResponseError);
    expect(error.reason).toBe('INVALID_ADDON');
    expect(error.message).not.toMatch(/synthetic-private/);
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it('does not infer an addon rejection from raw text in a transport error', async () => {
    sdk.client.callTool.mockRejectedValueOnce(new Error('INVALID_ADDON sid=synthetic-private-sid tid=synthetic-private-tid'));
    const error = await gateway().call('update_food_cart', {}).catch(error => error);
    expect(error).not.toBeInstanceOf(SwiggyResponseError);
    expect(error.message).not.toMatch(/synthetic-private|INVALID_ADDON/);
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it.each([[6, 0], [6, false], [8, 0], [8, false]])('exposes readable status %s with explicit out-of-stock flag %s for identity checks only', async (statusCode, inStock) => {
    const cart = { statusCode, statusMessage: 'Synthetic stock changed', data: { items: [{ menu_item_id: 'synthetic-item', quantity: 2, in_stock: inStock }], pricing: { item_total: 300, to_pay: 304 } } };
    sdk.client.callTool.mockResolvedValue({ structuredContent: cart, content: [], isError: false });
    await expect(gateway().call('get_food_cart', {})).resolves.toEqual(cart);
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it.each(['update_food_cart', 'apply_food_coupon', 'flush_food_cart'])('never treats status 8 from %s as a successful write', async name => {
    sdk.client.callTool.mockResolvedValue({ structuredContent: { statusCode: 8, data: { items: [{ menu_item_id: 'synthetic-item', quantity: 1, in_stock: 0 }] } }, content: [], isError: false });
    const error = await gateway().call(name, {}).catch(error => error);
    expect(error).toBeInstanceOf(SwiggyResponseError);
    expect(error.reason).toBe('UNAVAILABLE');
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it.each(['update_food_cart', 'apply_food_coupon', 'flush_food_cart'])('never treats status 6 from %s as a successful write', async name => {
    sdk.client.callTool.mockResolvedValue({ structuredContent: { statusCode: 6, data: { items: [{ menu_item_id: 'synthetic-item', quantity: 3, in_stock: 0 }] } }, content: [], isError: false });
    await expect(gateway().call(name, {})).rejects.toBeInstanceOf(SwiggyResponseError);
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it.each([
    { statusCode: 6, data: { items: [{ in_stock: true }] } },
    { statusCode: 6, successful: false, data: { items: [{ in_stock: 0 }] } },
  ])('keeps malformed or explicitly unsuccessful status-6 reads rejected %#', async cart => {
    sdk.client.callTool.mockResolvedValue({ structuredContent: cart, content: [], isError: false });
    await expect(gateway().call('get_food_cart', {})).rejects.toBeInstanceOf(SwiggyResponseError);
  });

  it.each([
    { statusCode: 8 },
    { statusCode: 8, data: { items: null } },
    { statusCode: 8, data: { items: [] } },
    { statusCode: 8, data: { items: [{ in_stock: true }] } },
    { statusCode: 8, successful: false, data: { items: [{ in_stock: 0 }] } },
  ])('rejects malformed or explicitly unsuccessful status-8 cart %#', async cart => {
    sdk.client.callTool.mockResolvedValue({ structuredContent: cart, content: [], isError: false });
    const error = await gateway().call('get_food_cart', {}).catch(error => error);
    expect(error).toBeInstanceOf(SwiggyResponseError);
    expect(error.reason).toBe('UNAVAILABLE');
  });

  it('unwraps an envelope before recognizing a readable out-of-stock cart', async () => {
    const cart = { statusCode: 8, data: { items: [{ menu_item_id: 'synthetic-item', quantity: 1, in_stock: false }], pricing: { to_pay: 304, item_total: 300 } } };
    sdk.client.callTool.mockResolvedValue({ structuredContent: { success: true, data: cart }, content: [], isError: false });
    await expect(gateway().call('get_food_cart', {})).resolves.toEqual(cart);
  });

  it.each([
    [{ statusCode: 1, errorCodes: ['INVALID_ADDON'] }, 'INVALID_ADDON'],
    [{ statusCode: 8, data: { items: [{ in_stock: 0 }] } }, 'UNAVAILABLE'],
    [{ successful: false }, 'REJECTED'],
  ] as const)('does not mistake a success envelope containing provider failure %# for a successful write', async (inner, reason) => {
    sdk.client.callTool.mockResolvedValue({ structuredContent: { success: true, data: { ...inner, sid: 'synthetic-private-sid', tid: 'synthetic-private-tid' } }, content: [], isError: false });
    const error = await gateway().call('update_food_cart', {}).catch(error => error);
    expect(error).toBeInstanceOf(SwiggyResponseError);
    expect(error.reason).toBe(reason);
    expect([error.message, JSON.stringify(error)].join(' ')).not.toContain('synthetic-private');
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it.each([false, true])('attaches only a private non-enumerable cart receipt to status-8 write errors (wrapped=%s)', async wrapped => {
    const cart = { statusCode: 8, sid: 'synthetic-private-sid', tid: 'synthetic-private-tid', statusMessage: 'synthetic-private-diagnostic', data: {
      restaurant: { deliverySubtitle: 'synthetic-private-location' },
      items: [{ menu_item_id: 'synthetic-item', name: 'synthetic-private-food', quantity: 2, in_stock: 0, addons: [] }],
      pricing: { item_total: 300, to_pay: 304 }, offers: { coupon_applied: null },
    } };
    sdk.client.callTool.mockResolvedValue({ structuredContent: wrapped ? { success: true, data: cart } : cart, content: [], isError: false });
    const error = await gateway().call('update_food_cart', { restaurantId: 'synthetic-r' }).catch(error => error);
    expect(error).toBeInstanceOf(SwiggyResponseError);
    expect(error.reason).toBe('UNAVAILABLE');
    expect(error.cartFingerprint).toBe(cartReceiptFingerprint(cart, 'synthetic-r'));
    expect(error.cartFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.getOwnPropertyDescriptor(error, 'cartFingerprint')?.enumerable).toBe(false);
    expect(Object.keys(error)).not.toContain('cartFingerprint');
    expect(JSON.stringify(error)).not.toContain(error.cartFingerprint);
    expect(error).not.toHaveProperty('data');
    expect(error).not.toHaveProperty('sid');
    expect(error).not.toHaveProperty('tid');
    expect(error).not.toHaveProperty('cause');
    const attachedValues = Object.getOwnPropertyNames(error).map(key => (error as any)[key]);
    expect(JSON.stringify(attachedValues)).not.toContain('synthetic-private');
  });

  it.each([
    ['apply_food_coupon', { statusCode: 8, data: { items: [{ in_stock: 0 }] } }],
    ['flush_food_cart', { statusCode: 8, data: { items: [{ in_stock: 0 }] } }],
    ['get_food_cart', { statusCode: 8, successful: false, data: { items: [{ in_stock: 0 }] } }],
    ['update_food_cart', { statusCode: 1, errorCodes: ['OUT_OF_STOCK'], data: { items: [{ in_stock: 0 }] } }],
    ['update_food_cart', { statusCode: 8, data: { items: [] } }],
    ['update_food_cart', { statusCode: 8, data: { items: null } }],
  ] as const)('never manufactures a receipt for unsupported error source %#', async (name, cart) => {
    sdk.client.callTool.mockResolvedValue({ structuredContent: cart, content: [], isError: false });
    const error = await gateway().call(name, {}).catch(error => error);
    expect(error).toBeInstanceOf(SwiggyResponseError);
    expect(error.cartFingerprint).toBeUndefined();
  });

  it.each(['Coupon does not exist', 'Invalid coupon code', 'Coupon is not applicable'])('classifies known coupon rejection %s without exposing report IDs or retrying the write', async rejection => {
    sdk.client.callTool.mockResolvedValue({ isError: true, content: [{ type: 'text', text: `${rejection}\nReport ID: synthetic-private-report\nsid=synthetic-private-session` }] });
    const error = await gateway().call('apply_food_coupon', { couponCode: 'SYNTHETIC' }).catch(error => error);
    expect(error).toBeInstanceOf(SwiggyResponseError);
    expect(error.reason).toBe('REJECTED');
    expect(Object.getOwnPropertyNames(error).map(key => String(error[key])).join(' ')).not.toContain('synthetic-private');
    expect(error.cartFingerprint).toBeUndefined();
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it.each([
    'Upstream timeout while checking coupon',
    'Transport lost: Coupon does not exist',
    'Coupon does not exist but transaction state is uncertain',
  ])('keeps unrelated or ambiguous coupon error text uncertain: %s', async text => {
    sdk.client.callTool.mockResolvedValue({ isError: true, content: [{ type: 'text', text: `${text}\nReport ID: synthetic-private-report` }] });
    const error = await gateway().call('apply_food_coupon', { couponCode: 'SYNTHETIC' }).catch(error => error);
    expect(error).not.toBeInstanceOf(SwiggyResponseError);
    expect(error.message).not.toContain('synthetic-private');
    expect(error.message).toContain('writes are never retried automatically');
    expect(sdk.client.callTool).toHaveBeenCalledOnce();
  });

  it('does not classify identical text from a transport exception or a different tool as safe coupon rejection', async () => {
    sdk.client.callTool.mockRejectedValueOnce(new Error('Coupon does not exist\nReport ID: synthetic-private-report'));
    const transportError = await gateway().call('apply_food_coupon', {}).catch(error => error);
    expect(transportError).not.toBeInstanceOf(SwiggyResponseError);
    sdk.client.callTool.mockResolvedValueOnce({ isError: true, content: [{ type: 'text', text: 'Coupon does not exist\nReport ID: synthetic-private-report' }] });
    const otherToolError = await gateway().call('update_food_cart', {}).catch(error => error);
    expect(otherToolError).not.toBeInstanceOf(SwiggyResponseError);
    expect(`${transportError.message} ${otherToolError.message}`).not.toContain('synthetic-private');
    expect(sdk.client.callTool).toHaveBeenCalledTimes(2);
  });

  it('waits for the local write window before making another remote call', async () => {
    vi.useFakeTimers();
    const live = gateway();
    try {
      for (let i = 0; i < 20; i++) await live.call('update_food_cart', { index: i });

      let settled = false;
      const next = live.call('update_food_cart', { index: 20 }).then(value => { settled = true; return value; });
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(sdk.client.callTool).toHaveBeenCalledTimes(20);

      await vi.advanceTimersByTimeAsync(60_001);
      await expect(next).resolves.toEqual({ ready: true });
      expect(sdk.client.callTool).toHaveBeenCalledTimes(21);
    } finally {
      vi.useRealTimers();
    }
  });
});
