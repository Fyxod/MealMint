# Swiggy MCP food assistant

Chat about your budget and food preferences in a web app or a private Telegram chat. A Codex-powered agent explores restaurants, menus and contextual deals, then shortlists inexpensive options. Delivered totals are checked only after you approve a temporary cart comparison.

**Prototype status:** the default uses a real Codex LLM with a clearly labelled synthetic Swiggy catalogue. The official MCP transport and Swiggy OAuth are implemented, but real account data and staging cart behaviour require approved Swiggy access. This app never exposes ordering or payment tools. It finds the cheapest among inspected options; paginated discovery cannot establish the cheapest across every restaurant.

## Run locally

Install Node.js 24+ and the [Codex CLI](https://developers.openai.com/codex/cli/). Then:

```bash
npm ci
cp .env.example .env
codex login status
# Run codex login if no ChatGPT session is available.
npm run dev
```

Open **http://localhost:5173**. Choose Home or Office (synthetic saved addresses), then try: “Vegetarian lunch under ₹180 including delivery. Show cheap options.” Ask for suitable item combinations too. Select up to three dishes or bundles, check delivered totals, and approve the exact items and quantities shown.

The default `CODEX_MODEL=gpt-6-luna` and `CODEX_EFFORT=max` follow the requested agent-test configuration. Inference uses your Codex/ChatGPT session and its plan limits. The app validates model and effort availability rather than silently switching models. Your existing local session is reused; Settings → Connect Codex starts sign-in when needed. The Codex session is separate from Swiggy account authorization.

For a deterministic offline walkthrough, explicitly set `AGENT_PROVIDER=demo`. This is a scripted mock, labelled in the UI, with no LLM calls. `SWIGGY_MODE=mock` by itself still uses the real Codex agent.

For a single production-style local server:

```bash
npm run build
APP_ORIGIN=http://localhost:3000 npm start
```

## Telegram

1. Create your own bot with [@BotFather](https://t.me/BotFather).
2. Put its token in the ignored `.env` as `TELEGRAM_BOT_TOKEN`, then restart the app.
3. In web Settings, select **Pair Telegram** and open the generated link. The pairing code expires after five minutes and can be used once.
4. Send `/addresses`, choose an address, and chat normally. `/new` starts fresh; `/cancel` stops the current operation.

Only the paired user's private chat can access the account. Web and Telegram have separate conversations but share the same Codex provider, Swiggy account and saved user directives. Long polling needs no public Telegram webhook. A cart comparison in either channel locks the shared comparison service. Telegram requires an empty existing cart; the web app can explicitly approve discarding a nonempty cart.

## Remember preferences and find combinations

Ask “Remember I prefer vegetarian lunches” or “Forget my mild-spice preference.” The agent can also save stable useful preferences on its own and tell you what it remembered. Settings shows the source and lets you add or delete directives. They survive restarts in the encrypted runtime store, with a limit of 30 directives of 500 characters each. Current requests override saved defaults. One-off budgets, credentials, exact addresses and transcripts should not be saved.

The agent can combine up to five observed simple dishes from one restaurant, including useful add-ons for coupon thresholds. A bundle’s quantities are multiplied by the requested bundle count. The backend compares the baseline and up to three eligible non-payment coupon codes separately, then keeps the lowest verified payable amount. Coupon stacking is not assumed. Above-budget subtotals may be proposed as clearly marked savings hypotheses; they count as affordable only after a verified total. This is bounded exploration, not exhaustive optimization.

## Connect real Swiggy data

Read [the access plan](docs/SWIGGY_ACCESS.md). After approval, set `SWIGGY_MODE=live`, use the endpoint provided by Swiggy, configure the exact approved `SWIGGY_REDIRECT_URI`, and connect in Settings. The app implements public-client dynamic registration, PKCE S256, state checks and encrypted local token storage.

Browsing can be tried before enabling live cart comparison. Keep `SWIGGY_LIVE_QUOTES_VALIDATED=false` until staging confirms response fields, price units, item IDs, coupon codes, restaurant switching and cleanup. Only then set that flag and `SWIGGY_CART_ITEM_ID_FIELD` to the validated field. These are operator gates, not substitutes for staging evidence. This repository has no live Swiggy validation claim.

## Development and operations

```bash
npm run typecheck
npm test
npm run build
npm run memory:check
npm audit
```

An opt-in authenticated LLM check (uses your plan, with synthetic food data):

```bash
CODEX_MODEL=gpt-6-luna CODEX_EFFORT=max npm run test:codex
CODEX_MODEL=gpt-6-luna CODEX_EFFORT=max npm run test:codex:advanced
```

Unit/integration tests use synthetic fixtures and fake transports. Authenticated LLM smoke checks are separate from CI and must use Luna max. See [validation evidence](docs/VALIDATION.md), [architecture](docs/ARCHITECTURE.md), and [Azure deployment](docs/AZURE.md).

The first deployment is a personal, single-owner service. `APP_ACCESS_TOKEN` protects the web app; Telegram requires pairing. Other app users and provider auth methods are later work. Do not offer this as a multi-user hosted service with your account's session.

Runtime secrets live in `.env` and `.local/`; both are ignored. The Swiggy token store uses AES-256-GCM with a local restricted key. This protects stored files from casual disclosure, not an attacker who controls the host. Conversations are held in memory, capped, and lost when restarting. Codex threads are ephemeral; do not publish account transcripts or runtime logs.

Durable context is in [project-memory](project-memory/README.md), maintained with the requested [Durable Project Memory skill](https://github.com/Fyxod/durable-project-memory). The personal prototype is hosted at [foodfinder.parthkatiyar.xyz](https://foodfinder.parthkatiyar.xyz/), protected by an owner access token. See [deployment audit](docs/DEPLOYMENT_AUDIT.md), [application answers](docs/APPLICATION_PACKET.md) and [video brief](docs/VIDEO_BRIEF.md). Real Swiggy access, Telegram bot credentials and the finished demo video remain pending.
