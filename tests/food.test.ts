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
