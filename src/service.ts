import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { cartData, cartFingerprint, cartReceiptFingerprint, rejectedCouponMarkerOnly } from "./cart.js";
import { cartPlanItems } from "./plans.js";
import { z } from "zod";
import type {
  Address,
  AgentProvider,
  Candidate,
  CartLine,
  ChoiceRef,
  CustomizationDetails,
  Conversation,
  FoodGateway,
  MealRequest,
  Quote,
  ToolSpec,
} from "./types.js";
import { defaultRequest } from "./types.js";
import { redact } from "./security.js";
import { DirectiveStore } from "./directives.js";
import { customizationDetails, selectCustomizations, selectionPayload, selectionsMatch, variantsMatch, validateCartAddons } from "./customizations.js";
import { couponCode as redeemableCouponCode, couponTrialPlan } from "./coupons.js";
import { menuItems, menuTruncated, restaurantOpen } from "./menu.js";
import { SwiggyResponseError } from "./food.js";

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
const choiceRefsProperty = {
  type: "array", maxItems: 40,
  items: objectSchema({ groupId: { type: "string" }, choiceId: { type: "string" } }, ["groupId", "choiceId"]),
};
export const foodTools: ToolSpec[] = [
  {
    type: "function", name: "food_customization_options",
    description: "Get fresh variant and add-on choices for an observed dish. Ask the user which choices they want unless they explicitly authorized defaults or cheapest choices. No cart writes.",
    inputSchema: objectSchema({ candidateId: { type: "string" } }, ["candidateId"]),
  },
  {
    type: "function", name: "food_customize",
    description: "Configure an observed dish using choice/group IDs returned by food_customization_options and the user's choices. Required groups and availability are validated. No cart writes. Selected payable price stays unverified until approved comparison.",
    inputSchema: objectSchema({ candidateId: { type: "string" }, variants: choiceRefsProperty, addons: choiceRefsProperty }, ["candidateId", "variants", "addons"]),
  },
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
      quantity: { type: "integer", minimum: 1, maximum: 10, description: "Copies of each shortlisted dish or entire bundle. Normally use1 when food_bundle already contains the requested per-item counts; quantity3 repeats its complete contents three times." },
      maxMinutes: { type: ["integer", "null"] },
      excluded: { type: "array", items: { type: "string" } },
    }),
  },
  {
    type: "function",
    name: "food_search",
    description:
      "Search dishes across restaurants, or pass an observed candidateId to search its restaurant for regular/promotional listings or useful additions. Returns only confirmed-open restaurant candidates, filtered for preferences, plus pagination. Final fees unknown. budgetCollection is synthetic-only.",
    inputSchema: objectSchema(
      {
        query: { type: "string" },
        candidateId: { type: "string" },
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
      "Propose a cart with up to five observed configured items from one restaurant. Quantities are per bundle, multiplied by request.quantity. Usually set food_preferences.quantity=1 before creating a bundle and put the desired final counts in items. Check returned finalItems against the user's exact counts before food_compare: line quantity3 and request.quantity3 means NINE, not three. Configure required choices first. No writes; final prices need approved comparison.",
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
      "Browse an observed candidate restaurant menu. Use nextPage for more categories when returned. Only use an observed candidate handle.",
    inputSchema: objectSchema({ candidateId: { type: "string" }, page: { type: "integer", minimum: 1 }, includePotentialDeals: { type: "boolean" } }, [
      "candidateId",
    ]),
  },
  {
    type: "function",
    name: "food_offers",
    description:
      "Get contextual coupons for an observed candidate. Optional couponCode must be explicitly supplied by the user in this chat; it queues that code for a fresh approved cart trial even if the gateway list is empty. Ordinary restaurant coupons only; payment-only savings remain unverified. Never invent codes.",
    inputSchema: objectSchema({ candidateId: { type: "string" }, couponCode: { type: "string", pattern: "^[A-Za-z0-9_-]{1,50}$" } }, [
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
      "Request explicit user approval to compare up to three observed candidates. Verify final per-item quantities match the user's request first. Returns exact frozen plan counts. DOES NOT change the cart or place orders.",
    inputSchema: objectSchema(
      { candidateIds: { ...idsProperty, maxItems: 3 } },
      ["candidateIds"],
    ),
  },
];
export { cartData, cartFingerprint } from "./cart.js";
export function qualifies(c: Candidate, r: MealRequest) {
  const unknownSelectionPrice = c.price === null && (!!c.selection || !!c.lines?.some(line => line.selection));
  return (
    c.available &&
    (unknownSelectionPrice || (c.price !== null && Number.isFinite(c.price) && c.price >= 0)) &&
    (r.diet === "any" || c.isVeg === (r.diet === "veg")) &&
    (!r.maxMinutes || (c.eta !== null && c.eta <= r.maxMinutes)) &&
    !r.excluded.some((x) => c.name.toLowerCase().includes(x.toLowerCase())) &&
    (!r.budget || unknownSelectionPrice || c.price! * r.quantity <= r.budget || c.dealHypothesis === true)
  );
}
function mismatchReason(candidate: Candidate, request: MealRequest) {
  return request.diet !== "any" && candidate.isVeg === null
    ? "This configuration's diet metadata is unknown. It cannot pass the selected diet filter; choose another option or ask the user before changing that filter."
    : "Selected option no longer matches the request. Search again.";
}
export class FoodService extends EventEmitter {
  readonly conversations = new Map<string, Conversation>();
  private registries = new Map<string, Map<string, Candidate>>();
  private reads = new Map<string, number>();
  private cartBusy = false;
  private cancelled = new Set<string>();
  private customizationMenus = new Map<string, { details: CustomizationDetails; at: number }>();
  private couponHints = new Map<string, Record<string, string[]>>();
  private customizationCursors = new Map<string, { offset: number; at: number }>();
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
    this.couponHints.delete(id);
    for (const key of this.customizationCursors.keys()) if (key.startsWith(id + ":")) this.customizationCursors.delete(key);
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
  async addresses() {
    // Fetch fresh account state; never keep addresses from a previous sign-in.
    const addresses = new Map<string, Address>();
    for (let page = 1; page <= 10; page++) {
      const raw = await this.gateway.call("get_addresses", { page, pageSize: 10 });
      const payload = raw?.data ?? raw;
      const data = Array.isArray(payload) ? payload : payload?.addresses;
      if (!Array.isArray(data))
        throw new Error("Unsupported address response. Validate the live schema.");
      for (const a of data) {
        const id = String(a.id ?? a.addressId ?? "");
        if (!id) continue;
        addresses.set(id, {
          id,
          label: String(a.addressTag || a.addressCategory || a.label || a.annotation || "Saved address"),
          display: String(a.addressLine ?? a.display ?? a.displayText ?? a.address ?? ""),
        });
      }
      if (payload?.pagination?.hasMore !== true) return [...addresses.values()];
    }
    throw new Error("Too many address pages. Please reduce saved addresses in Swiggy before continuing.");
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
    this.couponHints.delete(c.id);
    for (const key of this.customizationCursors.keys()) if (key.startsWith(c.id + ":")) this.customizationCursors.delete(key);
    for (const key of this.customizationMenus.keys()) if (key.startsWith(c.id + ":")) this.customizationMenus.delete(key);
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
      if (this.cancelled.has(id)) {
        c.error = null;
        c.status = "Ready";
      } else {
        c.error = redact((e as Error).message);
        c.status = "Needs attention";
        this.emit("event", { type: "error", conversationId: id, text: c.error });
      }
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
    this.status(c, c.busy ? "Stopping" : "Ready");
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
  async customizationOptions(id: string, candidateId: string) {
    const c = this.get(id), candidate = this.observed(id, candidateId);
    // A manual edit starts a fresh operation after a completed cancellation.
    if (!c.busy) { this.cancelled.delete(id); this.reads.set(id, 0); }
    if (candidate.lines || !c.request.addressId) throw new Error("Configure individual dishes before combining them.");
    const addressId = c.request.addressId;
    const key = `${id}:${candidateId}`;
    const cursor = this.customizationCursors.get(key);
    let offset = cursor && cursor.at + 300000 > Date.now() ? cursor.offset : 0;
    let item: any, more = false;
    for (let page = 0; page < 5; page++) {
      const raw = await this.read(id, "search_menu", {
        addressId, restaurantIdOfAddedItem: candidate.restaurantId,
        query: candidate.originalName ?? candidate.name,
        ...(offset ? { offset } : {}),
      });
      if (c.request.addressId !== addressId) throw new Error("Delivery address changed. Open the choices again.");
      item = (raw.items ?? raw.dishes ?? []).find((x: any) => String(x.menu_item_id ?? x.id) === candidate.itemId &&
        (x.restaurantId == null && x.restaurant_id == null || String(x.restaurantId ?? x.restaurant_id) === candidate.restaurantId));
      if (item) break;
      more = raw.hasMore === true;
      const next = Number(raw.nextOffset);
      if (!more) break;
      if (!Number.isSafeInteger(next) || next <= offset) {
        this.customizationCursors.delete(key);
        throw new Error("Swiggy returned incomplete customization search with an invalid page cursor. Availability is not established.");
      }
      offset = next;
      this.customizationCursors.set(key, { offset, at: Date.now() });
    }
    if (!item && more) throw new Error("Customization search is incomplete. Request choices again to continue the next pages; this does not mean the dish is unavailable.");
    this.customizationCursors.delete(key);
    if (!item) throw new Error("Swiggy did not return this listing's customization details. Its menu and search may disagree; choose another listing.");
    if (!(item.inStock === 1 || item.inStock === true)) throw new Error("This dish is no longer available. Search again.");
    const details = customizationDetails(item);
    this.customizationMenus.set(`${id}:${candidateId}`, { details, at: Date.now() });
    return { candidateId, name: candidate.originalName ?? candidate.name, details };
  }
  configure(id: string, candidateId: string, input: unknown, internal = false) {
    const c = this.get(id);
    if (c.busy && !internal) throw new Error("Wait for the current operation to finish.");
    const candidate = this.observed(id, candidateId);
    const cached = this.customizationMenus.get(`${id}:${candidateId}`);
    if (!cached || cached.at + 300000 < Date.now()) throw new Error("Customization choices expired. Open them again.");
    const ref = z.object({ groupId: z.string().min(1).max(100), choiceId: z.string().min(1).max(100) }).strict();
    const a = z.object({ variants: z.array(ref).max(40), addons: z.array(ref).max(40) }).strict().parse(input);
    const selection = selectCustomizations(cached.details, a.variants, a.addons);
    const originalIsVeg = candidate.originalIsVeg !== undefined ? candidate.originalIsVeg : candidate.isVeg;
    const selectedDiet = [originalIsVeg,
      ...a.variants.map(ref => cached.details.variants.find(g => g.id === ref.groupId)!.choices.find(x => x.id === ref.choiceId)!.isVeg),
      ...a.addons.map(ref => cached.details.addons.find(g => g.id === ref.groupId)!.choices.find(x => x.id === ref.choiceId)!.isVeg)];
    const configuredId = "option_" + createHash("sha256").update(JSON.stringify([c.request.addressId, candidate.restaurantId, candidate.itemId, selection.format, selection.variants, selection.addons])).digest("hex").slice(0, 16);
    const configured: Candidate = {
      ...candidate, id: configuredId, selection, originalName: candidate.originalName ?? candidate.name, originalIsVeg,
      name: `${candidate.originalName ?? candidate.name}${selection.summary.length ? " (" + selection.summary.join(", ") + ")" : ""}`,
      // Variant prices and free add-on rules are not additive across all menus.
      // The cart, rather than guessed arithmetic, establishes this selection's price.
      price: selection.variants.length || selection.addons.length ? null : candidate.price,
      customizable: false,
      isVeg: selectedDiet.includes(false) ? false : selectedDiet.every(x => x === true) ? true : null,
    };
    this.registries.get(id)!.set(configuredId, configured);
    this.customizationMenus.set(`${id}:${configuredId}`, cached);
    c.candidates = [...c.candidates.filter(x => x.id !== candidateId && x.id !== configuredId), configured].slice(-6);
    if (c.approval?.status === "pending") c.approval.status = "cancelled";
    c.quotes = [];
    c.error = null;
    if (!c.busy) c.status = "Ready";
    this.changed(c);
    return configured;
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
        !restaurantOpen(r)
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
    return out.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
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
        lastComparison: c.comparison ?? null,
        requestedCouponTrials: this.couponHints.get(id) ?? {},
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
    if (name === "food_customization_options" || name === "food_customize") {
      const a = z.object({ candidateId: z.string(), variants: z.array(z.any()).optional(), addons: z.array(z.any()).optional() }).strict().parse(args);
      if (name === "food_customization_options") return this.customizationOptions(id, a.candidateId);
      const configured = this.configure(id, a.candidateId, { variants: a.variants, addons: a.addons }, true);
      return { candidate: configured, matchesRequest: qualifies(configured, c.request),
        note: qualifies(configured, c.request) ? "Configured without cart changes. Selected payable price requires approved verification." : mismatchReason(configured, c.request) };
    }
    if (name === "food_search") {
      const a = z
        .object({
          query: z.string().trim().min(1).max(120),
          candidateId: z.string().optional(),
          offset: z.number().int().min(0).optional(),
          budgetCollection: z.boolean().optional(),
          includePotentialDeals: z.boolean().optional(),
        })
        .strict()
        .parse(args);
      if (a.budgetCollection && this.gateway.mode === "live")
        throw new Error("The current live Swiggy catalogue does not support the ₹99 collection filter. Search by dish without budgetCollection instead.");
      this.status(c, `Searching ${a.query}`);
      const scoped = a.candidateId ? this.observed(id, a.candidateId) : null;
      const scopeMenu = scoped ? await this.read(id, "get_restaurant_menu", {
        addressId: c.request.addressId, restaurantId: scoped.restaurantId, page: 1,
      }) : null;
      if (scoped && !restaurantOpen(scopeMenu?.restaurant))
        throw new Error("This restaurant is no longer confirmed open. Search for open alternatives.");
      const raw = scoped ? { restaurants: [scopeMenu.restaurant] } : await this.read(id, "search_restaurants", {
        addressId: c.request.addressId,
        query: a.query,
        ...(a.offset !== undefined ? { offset: a.offset } : {}),
        ...(a.budgetCollection ? { collection: "STORE_99" } : {}),
      });
      // Live restaurant search can return no dishes at all. Fetch the dish
      // catalogue separately and join only to restaurants confirmed open.
      const dishes = raw.dishes ?? raw.items ?? [];
      const menu = dishes.length ? raw : await this.read(id, "search_menu", {
        addressId: c.request.addressId,
        query: a.query,
        ...(scoped ? { restaurantIdOfAddedItem: scoped.restaurantId } : {}),
        ...(a.offset !== undefined ? { offset: a.offset } : {}),
        ...(c.request.diet === "veg" ? { vegFilter: 1 } : {}),
      });
      c.coverage.queries = [...new Set([...c.coverage.queries, a.query])];
      c.coverage.hasMore ||= !!menu.hasMore;
      const candidates = this.register(
        c,
        (dishes.length ? dishes : menu.items ?? []).map((item: any) =>
          scoped && item.restaurantId == null && item.restaurant_id == null
            ? { ...item, restaurantId: scoped.restaurantId } : item),
        raw.restaurants ?? [],
        a.includePotentialDeals,
      );
      const offset = Number(menu.nextOffset);
      return {
        candidates,
        hasMore: !!menu.hasMore,
        nextOffset: Number.isSafeInteger(offset) && offset >= 0 ? offset : undefined,
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
            !qualifies(x.candidate, { ...c.request, budget: null }),
        )
      )
        throw new Error(
          "Combine available observed dishes from one restaurant only. Configure required choices first.",
        );
      const merged = new Map<string, CartLine>();
      for (const { candidate, quantity } of choices) {
        const key = JSON.stringify([candidate.itemId, candidate.selection?.format, candidate.selection?.variants, candidate.selection?.addons]);
        const previous = merged.get(key);
        merged.set(key, {
          itemId: candidate.itemId,
          name: candidate.name,
          quantity: quantity + (previous?.quantity ?? 0),
          ...(candidate.selection ? { selection: structuredClone(candidate.selection) } : {}),
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
              lines.map((x) => [x.itemId, x.quantity, ...(x.selection ? [x.selection.format, x.selection.variants, x.selection.addons] : [])]),
            ]),
          )
          .digest("hex")
          .slice(0, 16);
      const price = choices.some(x => x.candidate.price === null) ? null :
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
        selection: undefined,
        originalName: undefined,
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
        finalItems: cartPlanItems(candidate, c.request.quantity),
        bundleCount: c.request.quantity,
        note: "Proposed cart only, no writes. finalItems are the actual total quantities, after multiplication. They must match the user's requested counts before comparison. Listed subtotal may differ from payable total; verify after approval.",
      };
    }
    if (name === "food_menu" || name === "food_offers") {
      const { candidateId, page, includePotentialDeals, couponCode } = z
          .object({ candidateId: z.string(), page: z.number().int().min(1).max(100).optional(), includePotentialDeals: z.boolean().optional(), couponCode: z.string().regex(/^[A-Za-z0-9_-]{1,50}$/).optional() })
          .strict()
          .parse(args),
        candidate = this.observed(id, candidateId);
      if (couponCode) {
        if (name !== "food_offers" || !c.messages.some(message => message.role === "user" &&
            message.text.toUpperCase().split(/[^A-Z0-9_-]+/).includes(couponCode.toUpperCase())))
          throw new Error("Only queue coupon codes explicitly supplied by the user in this chat. Never guess a code.");
        const hints = this.couponHints.get(id) ?? {};
        const codes = hints[candidate.restaurantId] ?? [];
        if (!codes.some(code => code.toUpperCase() === couponCode.toUpperCase())) {
          if (codes.length >= 3) throw new Error("At most three user-supplied coupon codes per restaurant per request.");
          hints[candidate.restaurantId] = [...codes, couponCode];
          this.couponHints.set(id, hints);
          if (c.approval?.status === "pending") c.approval.status = "cancelled";
          this.changed(c);
        }
      }
      const raw = await this.read(
        id,
        name === "food_menu" ? "get_restaurant_menu" : "fetch_food_coupons",
        {
          addressId: c.request.addressId,
          restaurantId: candidate.restaurantId,
          ...(couponCode ? { couponCode } : {}),
          ...(name === "food_menu" && page !== undefined ? { page } : {}),
        },
      );
      if (name === "food_offers") {
        const discovery = couponTrialPlan(raw);
        const listedCodes = (Array.isArray(raw?.coupon_sections) ? raw.coupon_sections : [])
          .flatMap((section: any) => Array.isArray(section?.coupons) ? section.coupons : [])
          .map(redeemableCouponCode).filter((code: string | null): code is string => code !== null);
        return {
          offers: raw,
          requestedCouponTrial: couponCode ?? null,
          discovery: { visible: discovery.visible, scope: discovery.scope,
            requestedCodeSource: couponCode ? "user" : null,
            requestedCodeReturned: couponCode ? listedCodes.some((code: string) => code.toUpperCase() === couponCode.toUpperCase()) : null },
          note: "Contextual visibility, not verified savings. The current gateway filters to cash-on-delivery-compatible coupons; online/card-only offers may be absent. An empty list does not disprove a coupon shown in the Swiggy app. A user-supplied code is queued for the next approved comparison, not verified or applied yet. Applicability may refer to the current cart; proposed items or thresholds can change eligibility. Payment-only offers unverified.",
        };
      }
      return {
        candidates: this.register(
          c,
          menuItems(raw).map((x: any) => ({
            ...x,
            restaurantId: candidate.restaurantId,
          })),
          [raw.restaurant],
          includePotentialDeals,
        ),
        truncated: menuTruncated(raw),
        nextPage: raw.hasMore === true && Number.isSafeInteger(raw.page) ? raw.page + 1 : undefined,
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
      const selected = [...new Set(candidateIds)].map((x) => this.observed(id, x));
      const mismatch = selected.find(x => !qualifies(x, c.request));
      if (mismatch) throw new Error(mismatchReason(mismatch, c.request));
      if (name === "food_compare") {
        const approval = await this.requestComparison(
          id,
          selected.map((x) => x.id),
        );
        return {
          status: approval.status,
          discardExisting: approval.discardExisting,
          selectedCount: approval.candidateIds.length,
          plans: approval.plans.map(plan => ({ candidateId: plan.id, items: cartPlanItems(plan, approval.request.quantity), requestedCoupons: approval.couponHints?.[plan.restaurantId] ?? [] })),
          expiresAt: approval.expiresAt,
          note: "The user must approve through the application controls.",
        };
      }
      c.candidates = selected.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
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
        throw new Error(mismatchReason(x, c.request));
      if (x.customizable)
        throw new Error(
          "Choose this dish's required variants and add-ons before comparing it.",
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
      couponHints: structuredClone(Object.fromEntries(plans.map(plan => [plan.restaurantId, this.couponHints.get(id)?.[plan.restaurantId] ?? []]))),
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
    c.comparison = { requested: a.candidateIds.length, checked: 0, issues: [], cancelled: false };
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
        const baseline = await this.rebuild(c, x, expected, value => { expected = value; });
        expected = cartFingerprint(baseline);
        const baselineQuote = this.quote(c, x, baseline);
        const couponChecks: NonNullable<Quote["couponChecks"]> = {
          status: "pending", scope: "visible", visible: 0, eligible: 0,
          attempted: [], rejected: [], untried: [],
        };
        baselineQuote.couponChecks = couponChecks;
        trials.push(baselineQuote);
        const recordBest = () => {
          const best = [...trials].sort((a, b) => a.total - b.total)[0];
          const index = c.quotes.findIndex(q => q.candidateId === x.id);
          if (index < 0) c.quotes.push(best); else c.quotes[index] = best;
          c.comparison!.checked = c.quotes.length;
          this.changed(c);
        };
        recordBest();
        if (this.cancelled.has(id)) break;
        const coupons = await this.gateway.call("fetch_food_coupons", {
          addressId: c.request.addressId,
          restaurantId: x.restaurantId,
        });
        const plan = couponTrialPlan(coupons);
        const requested = a.couponHints?.[x.restaurantId] ?? [];
        const allCodes = [...requested, ...plan.codes, ...plan.untried].filter((code, index, values) =>
          values.findIndex(value => value.toUpperCase() === code.toUpperCase()) === index);
        Object.assign(couponChecks, { visible: plan.visible, eligible: plan.eligible,
          scope: plan.scope, untried: allCodes,
          ...(requested.length ? { requested: [...requested], considered: allCodes.length } : {}),
        });
        const codes = allCodes.slice(0, 5);
        for (const code of codes) {
          if (this.cancelled.has(id)) break;
          const reset = await this.rebuild(c, x, expected, value => { expected = value; });
          expected = cartFingerprint(reset);
          await this.assertCart(c, expected);
          let applied;
          try {
            couponChecks.attempted.push(code);
            applied = await this.gateway.call("apply_food_coupon", {
              addressId: c.request.addressId,
              couponCode: code,
            });
          } catch (error) {
            if (!(error instanceof SwiggyResponseError) || error.reason !== "REJECTED") throw error;
            // A rejected code can remain as a zero-saving marker. Only accept
            // that precise mutation on the approved food; uncertain writes and
            // changes to actual contents, stock, prices or other offers stop.
            const rejectedCart = await this.gateway.call("get_food_cart", { addressId: c.request.addressId });
            if (cartFingerprint(rejectedCart) !== expected &&
                !(this.approvedCartMatches(c, x, rejectedCart) && rejectedCouponMarkerOnly(reset, rejectedCart, code)))
              throw new Error("Cart changed during coupon rejection. Inspect it in Swiggy.");
            expected = cartFingerprint(rejectedCart);
            couponChecks.rejected.push(code);
            couponChecks.untried = couponChecks.untried.filter(value => value !== code);
            c.comparison.issues.push(`Coupon ${code} was rejected; its savings were not counted.`);
            continue;
          }
          expected = cartFingerprint(applied);
          const confirmed = await this.gateway.call("get_food_cart", {
            addressId: c.request.addressId,
            restaurantName: x.restaurant,
          });
          if (cartFingerprint(confirmed) !== expected)
            throw new Error("Cart changed during coupon verification.");
          const q = this.quote(c, x, confirmed);
          q.couponChecks = couponChecks;
          couponChecks.untried = couponChecks.untried.filter(value => value !== code);
          if (q.coupon?.toUpperCase() === code.toUpperCase() && q.total < baselineQuote.total)
            trials.push(q);
          recordBest();
        }
        if (!this.cancelled.has(id)) couponChecks.status = "checked";
        recordBest();
      }
      c.quotes.sort((a, b) => a.total - b.total);
      a.status = this.cancelled.has(id) ? "cancelled" : "done";
      c.comparison.cancelled = this.cancelled.has(id);
      c.messages.push({
        id: randomUUID(),
        role: "assistant",
        text: c.quotes.length
          ? `Compared ${c.quotes.length} selected options. ${c.quotes.filter((q) => q.withinBudget).length} fit your delivered-total budget. These are snapshots, not a guaranteed price at checkout.${c.comparison.issues.length ? " " + c.comparison.issues.join(" ") : ""}`
          : "Comparison stopped.",
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      c.error = redact((e as Error).message);
      c.comparison.issues.push(c.error);
      a.status = "cancelled";
      c.messages.push({ id: randomUUID(), role: "assistant", timestamp: new Date().toISOString(),
        text: `Comparison incomplete: ${c.quotes.length} of ${a.candidateIds.length} selected options were checked. ${c.error} Results apply only to successfully checked configurations.` });
    } finally {
      if (expected) {
        try {
          await this.assertCart(c, expected);
          await this.gateway.call("flush_food_cart", {});
        } catch {
          c.error = `${c.error ? c.error + " " : ""}The test cart could not be safely cleared. Please inspect it in Swiggy.`;
          c.comparison.issues.push("The test cart could not be safely cleared. Please inspect it in Swiggy.");
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
  private async rebuild(c: Conversation, x: Candidate, expected: string, changed: (value: string) => void) {
    await this.assertCart(c, expected);
    await this.gateway.call("flush_food_cart", {});
    const readCart = () => this.gateway.call("get_food_cart", {
      addressId: c.request.addressId, restaurantName: x.restaurant,
    });
    changed(cartFingerprint(await readCart()));
    const lines: CartLine[] = x.lines ?? [{ itemId: x.itemId, name: x.name, quantity: 1, ...(x.selection ? { selection: x.selection } : {}) }];
    const seeds = new Map<number, ChoiceRef[]>();
    const rejected = async (error: unknown) => {
      if (error instanceof SwiggyResponseError && error.reason === "UNAVAILABLE") {
        const current = await readCart();
        // Swiggy may retain the exact submitted items while flagging them out
        // of stock. Only this identifiable approved cart can be cleared.
        const confirmedReceipt = error.cartFingerprint === cartReceiptFingerprint(current, x.restaurantId);
        if (this.approvedCartMatches(c, x, current, true, confirmedReceipt)) changed(cartFingerprint(current));
      }
    };
    const payload = (addons: boolean) => ({
      addressId: c.request.addressId,
      restaurantId: x.restaurantId,
      restaurantName: x.restaurant,
      cartItems: lines.map((line, index) => ({
        [this.options.cartItemIdField ?? "menuItemId"]: line.itemId,
        quantity: line.quantity * c.request.quantity,
        ...selectionPayload(line.selection, addons || line.selection?.format === null),
        ...(seeds.has(index) ? { addons: [...(addons || line.selection?.format === null ? line.selection?.addons ?? [] : []), ...seeds.get(index)!].map(ref => ({ group_id: ref.groupId, choice_id: ref.choiceId })) } : {}),
      })),
    });
    try { await this.gateway.call("update_food_cart", payload(false)); }
    catch (e) {
      await rejected(e);
      if (!(e instanceof SwiggyResponseError) || e.reason !== "INVALID_ADDON" || !lines.some(line => line.selection?.bootstrap?.length)) throw e;
      // Distinct, approved zero-price fixed-item alternatives, never a retry of
      // an uncertain transport failure or an invented optional addition.
      // Enumerate only the fixed choices already frozen in this approval. A
      // bounded set also supports mixed-item carts without adding new food.
      let combinations: [number, ChoiceRef][][] = [[]];
      for (const [index, line] of lines.entries()) {
        const fixed = line.selection?.bootstrap;
        if (fixed?.length) combinations = combinations.flatMap(previous => fixed.map(ref => [...previous, [index, ref] as [number, ChoiceRef]])).slice(0, 6);
      }
      let succeeded = false;
      for (const combination of combinations) {
        const current = await readCart();
        if ((cartData(current)?.items ?? []).length) throw new Error("Cart changed during fixed-choice validation. Inspect it in Swiggy.");
        changed(cartFingerprint(current));
        seeds.clear();
        for (const [index, ref] of combination) seeds.set(index, [ref]);
        try { await this.gateway.call("update_food_cart", payload(true)); succeeded = true; break; }
        catch (error) { await rejected(error); if (!(error instanceof SwiggyResponseError) || error.reason !== "INVALID_ADDON") throw error; }
      }
      if (!succeeded) throw new Error("This variant needs additional choices. Select its meal side/beverage or use another dish.");
    }
    let cart = await readCart();
    changed(cartFingerprint(cart));
    for (const line of lines.filter(line => line.selection)) {
      const item = (cartData(cart)?.items ?? []).find((item: any) => String(item.menu_item_id) === line.itemId && variantsMatch(line.selection!, item));
      if (!item) throw new Error("Cart variant does not match your choices.");
      validateCartAddons(line.selection!, item.valid_addons);
    }
    if (lines.some(line => line.selection?.addons.length)) {
      await this.assertCart(c, cartFingerprint(cart));
      try { await this.gateway.call("update_food_cart", payload(true)); }
      catch (error) { await rejected(error); throw error; }
      cart = await readCart();
      changed(cartFingerprint(cart));
    }
    return cart;
  }
  private approvedCartMatches(c: Conversation, x: Candidate, raw: any, allowUnavailable = false, confirmedReceipt = false) {
    const data = cartData(raw);
    const restaurantId = data?.restaurant?.id ?? data?.restaurant?.restaurant_id ?? data?.restaurant?.restaurantId;
    if ((allowUnavailable && restaurantId == null && !confirmedReceipt) || (restaurantId != null && String(restaurantId) !== x.restaurantId)) return false;
    const lines: CartLine[] = x.lines ?? [{ itemId: x.itemId, name: x.name, quantity: 1, ...(x.selection ? { selection: x.selection } : {}) }];
    const remaining = [...(data?.items ?? [])];
    if (remaining.length !== lines.length) return false;
    for (const line of lines) {
      const index = remaining.findIndex((item: any) => String(item.menu_item_id) === line.itemId &&
        item.quantity === line.quantity * c.request.quantity &&
        (allowUnavailable || (item.in_stock !== false && item.in_stock !== 0)) &&
        (line.selection ? selectionsMatch(line.selection, item) : item.addons == null || (Array.isArray(item.addons) && !item.addons.length)));
      if (index < 0) return false;
      remaining.splice(index, 1);
    }
    return true;
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
    if (data.restaurant?.id && String(data.restaurant.id) !== x.restaurantId)
      throw new Error("Cart restaurant does not match the candidate.");
    if ((data.items ?? []).some((item: any) => item.in_stock === 0 || item.in_stock === false))
      throw new SwiggyResponseError("UNAVAILABLE");
    if (!this.approvedCartMatches(c, x, raw)) throw new Error("Cart contents or customizations do not match the approved item.");
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
