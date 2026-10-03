import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { z } from "zod";
import type {
  Address,
  AgentProvider,
  Candidate,
  Conversation,
  FoodGateway,
  MealRequest,
  Quote,
  ToolSpec,
} from "./types.js";
import { defaultRequest } from "./types.js";
import { redact } from "./security.js";
import { DirectiveStore } from "./directives.js";

export const preferencesSchema = z
  .object({
    budget: z.number().finite().positive().max(10000).nullable().optional(),
    diet: z.enum(["any", "veg", "nonveg"]).optional(),
    quantity: z.number().int().min(1).max(10).optional(),
    maxMinutes: z.number().int().min(1).max(180).nullable().optional(),
    excluded: z.array(z.string().min(1).max(50)).max(15).optional(),
  })
  .strict();
const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({ type: "object", properties, required, additionalProperties: false });
const idsProperty = {
  type: "array",
  items: { type: "string" },
  minItems: 1,
  maxItems: 6,
};
export const foodTools: ToolSpec[] = [
  {
    type: "function",
    name: "food_remember",
    description:
      "Save a useful stable user directive across web/Telegram chats. source=user when explicitly asked to remember, otherwise inferred. No credentials, precise addresses or one-off requests.",
    inputSchema: objectSchema(
      {
        text: { type: "string", maxLength: 500 },
        source: { type: "string", enum: ["user", "inferred"] },
      },
      ["text", "source"],
    ),
  },
  {
    type: "function",
    name: "food_forget",
    description:
      "Remove a saved directive by its observed ID only when the user asks to forget it.",
    inputSchema: objectSchema({ directiveId: { type: "string" } }, [
      "directiveId",
    ]),
  },
  {
    type: "function",
    name: "food_context",
    description:
      "Get current preferences, observed options, verified quotes, address labels and coverage. No full addresses or credentials.",
    inputSchema: objectSchema({}),
  },
  {
    type: "function",
    name: "food_preferences",
    description:
      "Update budget (final delivered rupees), diet, quantity, max ETA or excluded ingredients based on user instructions. Preserve omitted fields.",
    inputSchema: objectSchema({
      budget: { type: ["number", "null"] },
      diet: { type: "string", enum: ["any", "veg", "nonveg"] },
      quantity: { type: "integer", minimum: 1, maximum: 10 },
      maxMinutes: { type: ["integer", "null"] },
      excluded: { type: "array", items: { type: "string" } },
    }),
  },
  {
    type: "function",
    name: "food_search",
    description:
      "Search dishes across restaurants for a query. Use budgetCollection for ₹99 storefront. Returns filtered candidates and pagination; final fees not yet known.",
    inputSchema: objectSchema(
      {
        query: { type: "string" },
        offset: { type: "integer", minimum: 0 },
        budgetCollection: { type: "boolean" },
        includePotentialDeals: { type: "boolean" },
      },
      ["query"],
    ),
  },
  {
    type: "function",
    name: "food_bundle",
    description:
      "Propose a cart with up to five observed simple items from one restaurant. Quantities are per bundle, multiplied by the requested quantity. No cart writes. Opt into includePotentialDeals only to test coupon savings on a subtotal above budget; affordability remains unverified.",
    inputSchema: objectSchema(
      {
        items: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: objectSchema(
            {
              candidateId: { type: "string" },
              quantity: { type: "integer", minimum: 1, maximum: 10 },
            },
            ["candidateId", "quantity"],
          ),
        },
        includePotentialDeals: { type: "boolean" },
      },
      ["items"],
    ),
  },
  {
    type: "function",
    name: "food_menu",
    description:
      "Browse an observed candidate restaurant menu. Only use an observed candidate handle.",
    inputSchema: objectSchema({ candidateId: { type: "string" } }, [
      "candidateId",
    ]),
  },
  {
    type: "function",
    name: "food_offers",
    description:
      "Get visible contextual coupons for an observed candidate. Visibility does not establish applicability. Payment-only offers remain unverified.",
    inputSchema: objectSchema({ candidateId: { type: "string" } }, [
      "candidateId",
    ]),
  },
  {
    type: "function",
    name: "food_present",
    description:
      "Publish up to six observed candidate handles as the user-visible shortlist. Filters and prices are enforced by the app.",
    inputSchema: objectSchema({ candidateIds: idsProperty }, ["candidateIds"]),
  },
  {
    type: "function",
    name: "food_compare",
    description:
      "Request explicit user approval to compare up to three observed candidates. DOES NOT change the cart or place orders.",
    inputSchema: objectSchema(
      { candidateIds: { ...idsProperty, maxItems: 3 } },
      ["candidateIds"],
    ),
  },
];
export function cartData(raw: any): any {
  return raw?.data?.pricing
    ? raw.data
    : raw?.pricing
      ? raw
      : raw?.data?.data?.pricing
        ? raw.data.data
        : (raw?.data ?? raw);
}
export function cartFingerprint(raw: any) {
  const c = cartData(raw);
  return createHash("sha256")
    .update(
      JSON.stringify({
        restaurant: c?.restaurant?.id ?? null,
        items: c?.items ?? [],
        offers: c?.offers ?? null,
        total: c?.pricing?.to_pay ?? null,
      }),
    )
    .digest("hex");
}
export function qualifies(c: Candidate, r: MealRequest) {
  return (
    c.available &&
    c.price !== null &&
    Number.isFinite(c.price) &&
    c.price >= 0 &&
    (r.diet === "any" || c.isVeg === (r.diet === "veg")) &&
    (!r.maxMinutes || (c.eta !== null && c.eta <= r.maxMinutes)) &&
    !r.excluded.some((x) => c.name.toLowerCase().includes(x.toLowerCase())) &&
    (!r.budget || c.price * r.quantity <= r.budget || c.dealHypothesis === true)
  );
}
export class FoodService extends EventEmitter {
  readonly conversations = new Map<string, Conversation>();
  private registries = new Map<string, Map<string, Candidate>>();
  private addressesCache: Address[] | null = null;
  private reads = new Map<string, number>();
  private cartBusy = false;
  private cancelled = new Set<string>();
  readonly directives: DirectiveStore;
  constructor(
    readonly gateway: FoodGateway,
    readonly agent: AgentProvider,
    private options: {
      liveQuotesValidated?: boolean;
      cartItemIdField?: string;
      directives?: DirectiveStore;
    } = {},
  ) {
    super();
    this.directives = options.directives ?? new DirectiveStore();
  }
  create(channel: "web" | "telegram" = "web") {
    this.prune();
    if (this.conversations.size >= 50)
      throw new Error(
        "Too many active conversations. Reset an old conversation first.",
      );
    const c: Conversation = {
      id: randomUUID(),
      channel,
      request: defaultRequest(),
      messages: [],
      candidates: [],
      quotes: [],
      approval: null,
      busy: false,
      error: null,
      status: "Ready",
      coverage: { queries: [], restaurants: 0, hasMore: false },
      updatedAt: Date.now(),
    };
    this.conversations.set(c.id, c);
    this.registries.set(c.id, new Map());
    return c;
  }
  get(id: string) {
    const c = this.conversations.get(id);
    if (!c) throw new Error("Conversation expired. Start a new chat.");
    c.updatedAt = Date.now();
    return c;
  }
  remove(id: string) {
    const c = this.get(id);
    if (c.busy)
      throw new Error("Stop the current operation before starting fresh.");
    this.conversations.delete(id);
    this.registries.delete(id);
    this.reads.delete(id);
    this.cancelled.delete(id);
    void this.agent.forget?.(id).catch(() => {});
  }
  private prune() {
    for (const [id, c] of this.conversations)
      if (!c.busy && c.updatedAt < Date.now() - 60 * 60000) this.remove(id);
  }
  snapshot(id: string) {
    return structuredClone(this.get(id));
  }
  private changed(c: Conversation) {
    c.updatedAt = Date.now();
    this.emit("event", { type: "state", conversationId: c.id });
  }
  private status(c: Conversation, text: string) {
    c.status = text;
    this.emit("event", { type: "status", conversationId: c.id, text });
    this.changed(c);
  }
  async addresses(refresh = false) {
    if (!this.addressesCache || refresh) {
      const raw = await this.gateway.call("get_addresses", {});
      const data = Array.isArray(raw)
        ? raw
        : (raw.addresses ?? raw.data?.addresses ?? raw.data);
      if (!Array.isArray(data))
        throw new Error(
          "Unsupported address response. Validate the live schema.",
        );
      this.addressesCache = data
        .map((a: any) => ({
          id: String(a.id ?? a.addressId ?? ""),
          label: String(a.label ?? a.annotation ?? "Saved address"),
          display: String(a.display ?? a.displayText ?? a.address ?? ""),
        }))
        .filter((a: Address) => a.id);
    }
    return this.addressesCache;
  }
  async selectAddress(id: string, addressId: string) {
    const c = this.get(id);
    if (c.busy) throw new Error("Wait for the current operation to finish.");
    if (!(await this.addresses()).some((x) => x.id === addressId))
      throw new Error("Choose an address returned by Swiggy.");
    c.request.addressId = addressId;
    this.invalidate(c);
    this.changed(c);
    return c;
  }
  private invalidate(c: Conversation) {
    if (c.approval?.status === "pending") c.approval.status = "cancelled";
    c.candidates = [];
    c.quotes = [];
    this.registries.set(c.id, new Map());
    c.coverage = { queries: [], restaurants: 0, hasMore: false };
  }
  updatePreferences(id: string, input: unknown) {
    const c = this.get(id);
    const preferences = preferencesSchema.parse(input);
    const old = JSON.stringify(c.request);
    Object.assign(c.request, preferences);
    if (old !== JSON.stringify(c.request)) this.invalidate(c);
    this.changed(c);
    return c.request;
  }
  async chat(id: string, text: string) {
    const c = this.get(id);
    if (c.busy) throw new Error("A reply is already in progress.");
    if (!text.trim() || text.length > 4000)
      throw new Error("Send a message of 1–4000 characters.");
    c.busy = true;
    c.error = null;
    this.cancelled.delete(id);
    this.reads.set(id, 0);
    c.messages.push({
      id: randomUUID(),
      role: "user",
      text,
      timestamp: new Date().toISOString(),
    });
    this.status(c, "Thinking");
    try {
      const answer = await this.agent.turn(
        id,
        text,
        foodTools,
        (name, args) => this.dispatch(id, name, args),
        (e) => this.emit("event", { ...e, conversationId: id }),
      );
      c.messages.push({
        id: randomUUID(),
        role: "assistant",
        text: answer,
        timestamp: new Date().toISOString(),
      });
      c.status = "Ready";
    } catch (e) {
      c.error = redact((e as Error).message);
      c.status = "Needs attention";
      this.emit("event", { type: "error", conversationId: id, text: c.error });
    } finally {
      c.busy = false;
      c.messages = c.messages.slice(-40);
      this.changed(c);
    }
    return c;
  }
  async cancel(id: string) {
    const c = this.get(id);
    this.cancelled.add(id);
    if (c.approval?.status === "pending") c.approval.status = "cancelled";
    await this.agent.cancel(id);
    this.status(c, "Stopping");
  }
  private async read(id: string, name: string, args: Record<string, unknown>) {
    if (this.cancelled.has(id)) throw new Error("Search cancelled.");
    const count = (this.reads.get(id) ?? 0) + 1;
    if (count > 20)
      throw new Error(
        "Search limit reached. Present the options checked and ask the user to refine or continue.",
      );
    this.reads.set(id, count);
    return this.gateway.call(name, args);
  }
  private observed(id: string, candidateId: string) {
    const c = this.registries.get(id)?.get(candidateId);
    if (!c)
      throw new Error(
        "Unknown candidate. Use a handle from the search results.",
      );
    return c;
  }
  private register(
    c: Conversation,
    items: any[],
    rs: any[],
    includePotentialDeals = false,
  ) {
    const registry = this.registries.get(c.id)!;
    const out: Candidate[] = [];
    for (const item of items) {
      const rid = item.restaurantId ?? item.restaurant_id,
        itemId = item.menu_item_id ?? item.id;
      const r = rs.find((x) => String(x.id ?? x.restaurantId) === String(rid));
      if (
        !rid ||
        !itemId ||
        !r ||
        !(r.availabilityStatus === "OPEN" || r.isOpen === true)
      )
        continue;
      const price =
        typeof item.price === "number" && Number.isFinite(item.price)
          ? item.price
          : null;
      const id =
        "option_" +
        createHash("sha256")
          .update(`${c.request.addressId}:${rid}:${itemId}`)
          .digest("hex")
          .slice(0, 16);
      const candidate: Candidate = {
        id,
        itemId: String(itemId),
        restaurantId: String(rid),
        name: String(item.name),
        restaurant: String(
          r.name ?? item.restaurantName ?? item.restaurant_name,
        ),
        price,
        isVeg: typeof item.isVeg === "boolean" ? item.isVeg : null,
        eta:
          r.deliveryTimeMinutes ??
          r.deliveryTime ??
          item.deliveryTimeMinutes ??
          null,
        rating: typeof r.avgRating === "number" ? r.avgRating : null,
        available: item.inStock === true || item.inStock === 1,
        customizable: !!item.hasVariants || !!item.hasAddons,
        offer: r.offer ?? null,
        source: this.gateway.mode,
        dealHypothesis:
          includePotentialDeals || registry.get(id)?.dealHypothesis === true,
      };
      registry.set(id, candidate);
      if (qualifies(candidate, c.request)) out.push(candidate);
    }
    c.coverage.restaurants = new Set(
      [...registry.values()].map((x) => x.restaurantId),
    ).size;
    this.changed(c);
    return out.sort((a, b) => a.price! - b.price!);
  }
  async dispatch(id: string, name: string, args: unknown): Promise<any> {
    const c = this.get(id);
    if (this.cancelled.has(id)) throw new Error("Search cancelled.");
    if (name === "food_context") {
      let addressError: string | null = null;
      const addresses = await this.addresses().catch((error) => {
        addressError = redact((error as Error).message);
        return [];
      });
      return {
        directives: await this.directives.list(),
        request: {
          ...c.request,
          addressId: c.request.addressId ? "selected" : null,
        },
        addresses: addresses.map((a) => ({
          label: a.label,
          selected: a.id === c.request.addressId,
        })),
        addressError,
        observed: [...(this.registries.get(id)?.values() ?? [])].filter((x) =>
          qualifies(x, c.request),
        ),
        quotes: c.quotes,
        approval: c.approval ? { status: c.approval.status } : null,
        coverage: c.coverage,
        source: this.gateway.mode,
      };
    }
    if (name === "food_remember") return this.directives.save(args);
    if (name === "food_forget") {
      const { directiveId } = z
        .object({ directiveId: z.string().uuid() })
        .strict()
        .parse(args);
      return this.directives.remove(directiveId);
    }
    if (name === "food_preferences") {
      const request = this.updatePreferences(id, args);
      return { ...request, addressId: request.addressId ? "selected" : null };
    }
    if (!c.request.addressId)
      throw new Error("Ask the user to select a saved delivery address first.");
    if (name === "food_search") {
      const a = z
        .object({
          query: z.string().trim().min(1).max(120),
          offset: z.number().int().min(0).optional(),
          budgetCollection: z.boolean().optional(),
          includePotentialDeals: z.boolean().optional(),
        })
        .strict()
        .parse(args);
      this.status(c, `Searching ${a.query}`);
      const raw = await this.read(id, "search_restaurants", {
        addressId: c.request.addressId,
        query: a.query,
        ...(a.offset !== undefined ? { offset: a.offset } : {}),
        ...(a.budgetCollection ? { collection: "STORE_99" } : {}),
      });
      c.coverage.queries = [...new Set([...c.coverage.queries, a.query])];
      c.coverage.hasMore ||= !!raw.hasMore;
      const candidates = this.register(
        c,
        raw.dishes ?? raw.items ?? [],
        raw.restaurants ?? [],
        a.includePotentialDeals,
      );
      return {
        candidates,
        hasMore: !!raw.hasMore,
        nextOffset: raw.nextOffset,
        coverage: c.coverage,
        note: "Listed prices only; fees and coupons need an approved cart comparison. includePotentialDeals can admit subtotals above budget as hypotheses; never claim they are affordable before verifying payable totals.",
      };
    }
    if (name === "food_bundle") {
      const input = z
        .object({
          items: z
            .array(
              z
                .object({
                  candidateId: z.string(),
                  quantity: z.number().int().min(1).max(10),
                })
                .strict(),
            )
            .min(1)
            .max(5),
          includePotentialDeals: z.boolean().optional(),
        })
        .strict()
        .parse(args);
      const choices = input.items.map((line) => ({
        candidate: this.observed(id, line.candidateId),
        quantity: line.quantity,
      }));
      const first = choices[0].candidate;
      if (
        choices.some(
          (x) =>
            x.candidate.lines ||
            x.candidate.customizable ||
            x.candidate.restaurantId !== first.restaurantId ||
            x.candidate.price === null ||
            !qualifies(x.candidate, { ...c.request, budget: null }),
        )
      )
        throw new Error(
          "Combine available simple observed dishes from one restaurant only.",
        );
      const merged = new Map<
        string,
        { itemId: string; name: string; quantity: number }
      >();
      for (const { candidate, quantity } of choices) {
        const previous = merged.get(candidate.itemId);
        merged.set(candidate.itemId, {
          itemId: candidate.itemId,
          name: candidate.name,
          quantity: quantity + (previous?.quantity ?? 0),
        });
      }
      const lines = [...merged.values()].sort((a, b) =>
        a.itemId.localeCompare(b.itemId),
      );
      if (lines.some((line) => line.quantity * c.request.quantity > 10))
        throw new Error(
          "Each dish quantity must stay within 10 after multiplying by requested bundles.",
        );
      const bundleId =
        "bundle_" +
        createHash("sha256")
          .update(
            JSON.stringify([
              c.request.addressId,
              first.restaurantId,
              lines.map((x) => [x.itemId, x.quantity]),
            ]),
          )
          .digest("hex")
          .slice(0, 16);
      const price =
        Math.round(
          choices.reduce((sum, x) => sum + x.candidate.price! * x.quantity, 0) *
            100,
        ) / 100;
      const candidate: Candidate = {
        ...first,
        id: bundleId,
        name: lines.map((x) => `${x.quantity} × ${x.name}`).join(" + "),
        price,
        lines,
        isVeg: choices.every((x) => x.candidate.isVeg === true)
          ? true
          : choices.some((x) => x.candidate.isVeg === false)
            ? false
            : null,
        dealHypothesis: input.includePotentialDeals === true,
      };
      if (!qualifies(candidate, c.request))
        throw new Error(
          "Bundle subtotal exceeds budget. Use includePotentialDeals only when exploring a possible coupon reduction.",
        );
      this.registries.get(id)!.set(candidate.id, candidate);
      this.changed(c);
      return {
        candidate,
        note: "Proposed cart only, no writes. Listed subtotal may differ from payable total; verify after approval. This bundle is repeated request.quantity times.",
      };
    }
    if (name === "food_menu" || name === "food_offers") {
      const { candidateId } = z
          .object({ candidateId: z.string() })
          .strict()
          .parse(args),
        candidate = this.observed(id, candidateId);
      const raw = await this.read(
        id,
        name === "food_menu" ? "get_restaurant_menu" : "fetch_food_coupons",
        {
          addressId: c.request.addressId,
          restaurantId: candidate.restaurantId,
        },
      );
      if (name === "food_offers")
        return {
          offers: raw,
          note: "Contextual visibility, not verified savings. Applicability may refer to the current cart; proposed items or thresholds can change eligibility. Check the proposed cart through approved comparison. Payment-only offers unverified.",
        };
      return {
        candidates: this.register(
          c,
          (raw.items ?? []).map((x: any) => ({
            ...x,
            restaurantId: candidate.restaurantId,
          })),
          [raw.restaurant],
        ),
        truncated: !!raw.truncated,
      };
    }
    if (name === "food_present" || name === "food_compare") {
      const { candidateIds } = z
        .object({
          candidateIds: z
            .array(z.string())
            .min(1)
            .max(name === "food_compare" ? 3 : 6),
        })
        .strict()
        .parse(args);
      const selected = [...new Set(candidateIds)]
        .map((x) => this.observed(id, x))
        .filter((x) => qualifies(x, c.request));
      if (selected.length !== new Set(candidateIds).size)
        throw new Error(
          "Selected options no longer match the request. Search again.",
        );
      if (name === "food_compare") {
        const approval = await this.requestComparison(
          id,
          selected.map((x) => x.id),
        );
        return {
          status: approval.status,
          discardExisting: approval.discardExisting,
          selectedCount: approval.candidateIds.length,
          expiresAt: approval.expiresAt,
          note: "The user must approve through the application controls.",
        };
      }
      c.candidates = selected.sort((a, b) => a.price! - b.price!);
      this.changed(c);
      return { shown: c.candidates };
    }
    throw new Error("Tool is not allowed.");
  }
  async requestComparison(id: string, candidateIds: string[]) {
    const c = this.get(id);
    if (this.cartBusy) throw new Error("Another cart comparison is running.");
    const ids = z.array(z.string()).min(1).max(3).parse(candidateIds);
    if (!c.request.budget || !c.request.addressId)
      throw new Error("Set a delivery address and budget first.");
    if (
      this.gateway.mode === "live" &&
      (!this.options.liveQuotesValidated || !this.options.cartItemIdField)
    )
      throw new Error(
        "Live cart comparisons are disabled until the staging cart schema is validated. Browsing is available.",
      );
    for (const cid of ids) {
      const x = this.observed(id, cid);
      if (!qualifies(x, c.request))
        throw new Error("Option no longer matches your request.");
      if (x.customizable)
        throw new Error(
          "This item requires customizations. Choose a simple item for this prototype.",
        );
    }
    const request = structuredClone(c.request);
    const plans = [...new Set(ids)].map((cid) =>
      structuredClone(this.observed(id, cid)),
    );
    const cart = await this.gateway.call("get_food_cart", {
      addressId: c.request.addressId,
    });
    if (JSON.stringify(request) !== JSON.stringify(c.request))
      throw new Error(
        "Preferences changed while preparing approval. Request a new comparison.",
      );
    c.approval = {
      id: randomUUID(),
      candidateIds: [...new Set(ids)],
      plans,
      expiresAt: Date.now() + 120000,
      request,
      fingerprint: cartFingerprint(cart),
      status: "pending",
      discardExisting: (cartData(cart)?.items?.length ?? 0) > 0,
    };
    this.changed(c);
    return c.approval;
  }
  async approve(id: string, approvalId: string, discardExisting = false) {
    const c = this.get(id),
      a = c.approval;
    if (c.busy || this.cartBusy)
      throw new Error("An operation is already running.");
    if (
      !a ||
      a.id !== approvalId ||
      a.status !== "pending" ||
      a.expiresAt < Date.now()
    )
      throw new Error(
        "Approval expired or was already used. Request a new comparison.",
      );
    if (JSON.stringify(a.request) !== JSON.stringify(c.request))
      throw new Error("Preferences changed. Request a new comparison.");
    if (a.discardExisting && !discardExisting)
      throw new Error(
        "Your existing cart would be discarded. Explicitly confirm that first.",
      );
    a.status = "running";
    c.busy = true;
    c.error = null;
    c.quotes = [];
    this.cartBusy = true;
    this.cancelled.delete(id);
    this.changed(c);
    let expected: string | null = null;
    try {
      const before = await this.gateway.call("get_food_cart", {
        addressId: c.request.addressId,
      });
      if (cartFingerprint(before) !== a.fingerprint)
        throw new Error(
          "Cart changed since approval. No comparison was started.",
        );
      expected = a.fingerprint;
      for (const cid of a.candidateIds) {
        if (this.cancelled.has(id)) break;
        const x = a.plans.find((plan) => plan.id === cid)!;
        this.status(c, `Checking delivered total for ${x.name}`);
        const trials: Quote[] = [];
        const baseline = await this.rebuild(c, x, expected);
        expected = cartFingerprint(baseline);
        const baselineQuote = this.quote(c, x, baseline);
        trials.push(baselineQuote);
        const coupons = await this.gateway.call("fetch_food_coupons", {
          addressId: c.request.addressId,
          restaurantId: x.restaurantId,
        });
        // The live coupon ID->code mapping must be validated in staging before enabling quotes.
        const codes: string[] = (coupons.coupon_sections ?? [])
          .flatMap((s: any) => s.coupons ?? [])
          .filter(
            (o: any) =>
              (o.applicable === true ||
                o.applicabilityStatus === "APPLICABLE") &&
              !/card|online|bank|upi/i.test(JSON.stringify(o)),
          )
          .map((o: any) => o.code ?? o.id)
          .filter(
            (s: any) =>
              typeof s === "string" && /^[A-Za-z0-9_-]{1,50}$/.test(s),
          )
          .filter(
            (code: string, index: number, codes: string[]) =>
              codes.indexOf(code) === index,
          )
          .slice(0, 3);
        for (const code of codes) {
          if (this.cancelled.has(id)) break;
          const reset = await this.rebuild(c, x, expected);
          expected = cartFingerprint(reset);
          await this.assertCart(c, expected);
          const applied = await this.gateway.call("apply_food_coupon", {
            addressId: c.request.addressId,
            couponCode: code,
          });
          expected = cartFingerprint(applied);
          const confirmed = await this.gateway.call("get_food_cart", {
            addressId: c.request.addressId,
            restaurantName: x.restaurant,
          });
          if (cartFingerprint(confirmed) !== expected)
            throw new Error("Cart changed during coupon verification.");
          const q = this.quote(c, x, confirmed);
          if (q.coupon === code && q.total < baselineQuote.total)
            trials.push(q);
        }
        const best = trials.sort((a, b) => a.total - b.total)[0];
        c.quotes.push(best);
        this.changed(c);
      }
      c.quotes.sort((a, b) => a.total - b.total);
      a.status = this.cancelled.has(id) ? "cancelled" : "done";
      c.messages.push({
        id: randomUUID(),
        role: "assistant",
        text: c.quotes.length
          ? `Compared ${c.quotes.length} selected options. ${c.quotes.filter((q) => q.withinBudget).length} fit your delivered-total budget. These are snapshots, not a guaranteed price at checkout.`
          : "Comparison stopped.",
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      c.error = redact((e as Error).message);
      a.status = "cancelled";
    } finally {
      if (expected) {
        try {
          await this.assertCart(c, expected);
          await this.gateway.call("flush_food_cart", {});
        } catch {
          c.error = `${c.error ? c.error + " " : ""}The test cart could not be safely cleared. Please inspect it in Swiggy.`;
        }
      }
      this.cartBusy = false;
      c.busy = false;
      c.status = c.error ? "Needs attention" : "Ready";
      this.changed(c);
    }
    return c;
  }
  private async assertCart(c: Conversation, expected: string) {
    const cart = await this.gateway.call("get_food_cart", {
      addressId: c.request.addressId,
    });
    if (cartFingerprint(cart) !== expected)
      throw new Error(
        "Cart changed outside this comparison. Stopped to avoid overwriting it.",
      );
  }
  private async rebuild(c: Conversation, x: Candidate, expected: string) {
    await this.assertCart(c, expected);
    await this.gateway.call("flush_food_cart", {});
    await this.gateway.call("update_food_cart", {
      addressId: c.request.addressId,
      restaurantId: x.restaurantId,
      restaurantName: x.restaurant,
      cartItems: (
        x.lines ?? [{ itemId: x.itemId, name: x.name, quantity: 1 }]
      ).map((line) => ({
        [this.options.cartItemIdField ?? "menuItemId"]: line.itemId,
        quantity: line.quantity * c.request.quantity,
      })),
    });
    return this.gateway.call("get_food_cart", {
      addressId: c.request.addressId,
      restaurantName: x.restaurant,
    });
  }
  private quote(c: Conversation, x: Candidate, raw: any): Quote {
    const data = cartData(raw),
      p = data?.pricing;
    if (
      !p ||
      !Number.isFinite(p.to_pay) ||
      p.to_pay < 0 ||
      !Number.isFinite(p.item_total)
    )
      throw new Error("No verified payable total was returned.");
    if (data.restaurant?.id && data.restaurant.id !== x.restaurantId)
      throw new Error("Cart restaurant does not match the candidate.");
    const items = data.items ?? [];
    const expectedLines = x.lines ?? [
      { itemId: x.itemId, name: x.name, quantity: 1 },
    ];
    if (
      items.length !== expectedLines.length ||
      new Set(items.map((item: any) => item.menu_item_id)).size !==
        items.length ||
      expectedLines.some(
        (line) =>
          !items.some(
            (item: any) =>
              item.menu_item_id === line.itemId &&
              item.quantity === line.quantity * c.request.quantity,
          ),
      )
    )
      throw new Error("Cart contents do not match the approved item.");
    const discount = Number(data.offers?.coupon_discount ?? 0);
    return {
      candidateId: x.id,
      name: x.name,
      restaurant: x.restaurant,
      quantity: c.request.quantity,
      itemTotal: p.item_total,
      delivery: p.delivery_charge ?? p.delivery_fee ?? null,
      charges: p.taxes_and_charges ?? null,
      discount: Number.isFinite(discount) && discount > 0 ? discount : 0,
      coupon:
        typeof data.offers?.coupon_applied === "string"
          ? data.offers.coupon_applied
          : null,
      total: p.to_pay,
      checkedAt: new Date().toISOString(),
      withinBudget: p.to_pay <= c.request.budget!,
      source: this.gateway.mode,
      bundle: !!x.lines,
    };
  }
  async close() {
    await this.agent.close();
    await this.gateway.close();
  }
}
