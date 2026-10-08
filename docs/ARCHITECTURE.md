# Architecture

```mermaid
flowchart LR
    Web[Web chat / SSE] --> Service[Personal account service]
    TG[Paired private Telegram chat] --> Service
    Service <--> Codex[Codex app-server / ChatGPT auth]
    Codex --> Tools[Controlled dynamic food tools]
    Tools --> Service
    Service --> Gateway[Mock or official Swiggy MCP]
    Consent[Explicit comparison approval] --> Service
    OAuth[Swiggy PKCE OAuth] --> Gateway
```

The React client and Telegram adapter call the same `FoodService`. A conversation tracks preferences, observed candidates, coverage and temporary approval state. The agent can update preferences, search, inspect offers, present a shortlist and request a comparison. It receives only controlled dynamic tools, with execution/editing/web tools disabled and unrelated approvals declined.

Candidate handles come from actual gateway responses. The application checks stock, restaurant availability, diet, budget, quantity and ETA, and rejects invented handles. Ingredient exclusions are name matching only, not verified ingredients or allergy advice. Missing availability data is excluded. Both interfaces support observed variants and add-ons, enforcing required groups, maxima and availability. Exact selected IDs are frozen for approval; configured prices remain unknown until verified in the cart.

The agent does not calculate trusted checkout prices. An approval expires after two minutes and binds frozen copies of the exact item plans, preferences, quantity, address and starting cart fingerprint. Both channels display total per-item quantities computed from those frozen plans. Bundle/compare tools return the same authoritative counts to the agent, whose prompt distinguishes a single-dish quantity from copies of an entire bundle. Comparing is serial for the account, snapshots `pricing.to_pay`, verifies coupon application and clears only the expected test cart. Fingerprints compare selected item contents, quantities, variants, add-ons, stock, prices, offers and restaurant identity; unused `valid_addons` catalogs are excluded because Swiggy changes them between reads. A changed selected cart stops the operation. Existing items need a separate explicit discard confirmation on web. There is no transactional lock over the external Swiggy app; a read/write race remains possible, so the user should leave that cart alone during comparison.

The MCP gateway retains a connection, paces conservative local request limits, and avoids retrying uncertain writes. A comparison checks baseline plus up to three distinct eligible non-payment coupons per dish or bundle; it does not claim to exhaust every offer. A confirmed coupon rejection is skipped only after checking the unchanged cart, retaining previously verified totals. The owner deployment enables live comparison after controlled validation, recorded in [LIVE_VALIDATION.md](LIVE_VALIDATION.md). Swiggy's current coupon tool filters COD-compatible offers; payment-only discounts cannot count as verified savings. Search and comparison coverage is bounded; full market enumeration is not promised.

Observed dishes can form one-restaurant bundles with exact per-line quantities, including configured dishes. Backend guards reject nested bundles, mixed restaurants, unconfigured choices and final per-item quantities above ten. Above-budget proposals require an explicit hypothesis flag; only `pricing.to_pay` establishes affordability. Trials verify returned item IDs, quantities, variants/add-ons and applied coupon codes, including fee reductions with zero item discount. Typed invalid-add-on responses can lead to at most six combinations of already-approved fixed zero-price structural choices; they cannot add unapproved food. Out-of-stock cart responses remain readable for identification and cleanup but never become quotes. When restaurant identity is omitted, unavailable-write recovery requires the exact approved contents plus a matching private receipt hash bound to the submitted restaurant. Extra or uncertain cart state is preserved.

User directives are stored separately from chats through `DirectiveStore`, shared by both channels. Writes are serialized, deduplicated and encrypted with atomic replacement; the store caps at 30 entries. Agent tools remember explicit or inferred stable preferences and forget observed IDs. Settings provides manual controls. Directive text is preference data, not permission to override cart safeguards; known credential patterns are rejected. Codex refreshes context each turn.

Swiggy OAuth is separate from Codex sign-in. OAuth state and PKCE verifier are short-lived and single-use. Discovered auth endpoints must stay on the official authorization origin. Runtime credentials are encrypted in a restricted local directory; no credentials are returned to the LLM. Conversation messages are in process memory, with bounded history and idle expiry on new conversation creation.

The server is a personal single-owner service. Cookie sessions use HTTP-only cookies and CSRF checks; hosted configurations require an access token and HTTPS origin, including behind a localhost reverse proxy. Telegram ignores unpaired users and group chats. Future multi-user support requires separate provider sessions, Swiggy tokens, conversations and access control per user.
