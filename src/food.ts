import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FoodGateway } from "./types.js";

const allowed = new Set([
  "get_addresses",
  "search_restaurants",
  "search_menu",
  "get_restaurant_menu",
  "fetch_food_coupons",
  "get_food_cart",
  "update_food_cart",
  "apply_food_coupon",
  "flush_food_cart",
]);
export class LiveFoodGateway implements FoodGateway {
  readonly mode = "live" as const;
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private blockedUntil = 0;
  private requests: { at: number; write: boolean }[] = [];
  constructor(
    private endpoint: string,
    private token: () => Promise<string | null>,
  ) {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      !["mcp.swiggy.com", "mcp-staging.swiggy.com"].includes(url.hostname) ||
      url.pathname !== "/food"
    )
      throw new Error("Use an official Swiggy Food endpoint.");
  }
  async close() {
    await this.client?.close();
    this.client = null;
  }
  private async connection() {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const token = await this.token();
      if (!token) throw new Error("Connect Swiggy first.");
      const client = new Client({
        name: "mealmint-personal-assistant",
        version: "0.1.0",
      });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(this.endpoint), {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }),
      );
      const tools = await client.listTools();
      for (const name of allowed)
        if (!tools.tools.some((x) => x.name === name)) {
          await client.close();
          throw new Error(
            "Swiggy tool catalogue changed. Validate the adapter before live use.",
          );
        }
      this.client = client;
      return client;
    })();
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }
  async call(name: string, args: Record<string, unknown>) {
    if (!allowed.has(name)) throw new Error("Tool is not allowed.");
    const write = [
      "update_food_cart",
      "apply_food_coupon",
      "flush_food_cart",
    ].includes(name);
    // Pace local quotas rather than strand a comparison cart when cleanup reaches
    // the limit. This waits BEFORE issuing a request; writes are never retried.
    for (;;) {
      const now = Date.now();
      if (now < this.blockedUntil)
        throw new Error("Swiggy is rate limited. Wait before trying again.");
      this.requests = this.requests.filter((x) => x.at > now - 60000);
      const writes = this.requests.filter((x) => x.write);
      const constrained =
        this.requests.length >= 50
          ? this.requests
          : write && writes.length >= 20
            ? writes
            : null;
      if (!constrained) {
        this.requests.push({ at: now, write });
        break;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(1, constrained[0].at + 60001 - now)),
      );
    }
    try {
      const result = await (
        await this.connection()
      ).callTool({ name, arguments: args });
      let data: any = result.structuredContent;
      if (!data) {
        const block = (result.content as any[])?.find((x) => x.type === "text");
        if (block) {
          try {
            data = JSON.parse(block.text);
          } catch {
            throw new Error(
              "Swiggy returned an unsupported unstructured response.",
            );
          }
        }
      }
      if (result.isError || data?.success === false)
        throw new Error("Swiggy could not complete this request.");
      if (!data) throw new Error("Swiggy returned no structured data.");
      return data.success === true && "data" in data ? data.data : data;
    } catch (e: any) {
      if (
        e.code === 401 ||
        /401|unauthoriz|revoked|419/i.test(String(e.message))
      ) {
        await this.close();
        throw new Error(
          "Swiggy authorization expired. Reconnect your account.",
        );
      }
      if (e.code === 429 || /429|rate.limit/i.test(String(e.message))) {
        this.blockedUntil = Date.now() + 60000;
        throw new Error(
          "Swiggy is rate limited. Wait a minute before trying again.",
        );
      }
      // Never retry a write automatically; a failed response may still have changed the cart.
      throw new Error(
        "Swiggy request failed. Refresh and try again; writes are never retried automatically.",
      );
    }
  }
}
