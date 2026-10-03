# Decision log

## 2026-10-03 — Initial implementation

Shared local TypeScript service with React web chat and Telegram long polling. Codex app-server stdio with controlled dynamic tools; separate Swiggy OAuth. Mock Swiggy responses before approved access, clearly labelled.

Azure supersedes the earlier proposed Render relay. Prepare deployment without publishing until the user supplies access. No exhaustive global cheapest claim: rank only inspected candidates and quote actual cart totals.

Cart comparison is serial, requires bounded approval, and avoids silently clearing an existing cart. No ordering/payment tools.

## 2026-10-03 — Implementation and test clarification

User clarified Luna max is the application's actual LLM for Codex-auth/MCP validation, not a mandatory test subagent. User prefers root implementation; root owns source and UI, Luna verifies tests only. Initial implementation exists but external outcomes remain gated.

Live cart writes remain disabled until staging schema/unit validation. The prototype checks at most one eligible coupon per candidate, and local request quotas pace requests before sending them rather than retrying writes. Starting fresh releases the old idle conversation and Codex subscription to limit memory growth. Hosted HTTPS origins require an app token even behind a localhost proxy.

Initial 24 tests on Vitest 3 were a partial verification checkpoint, not final validation. Dependency upgrades fixed the observed audit findings; the npm 9 upgrade attempt failed with edgesOut, and npm 11 completed the update with zero reported vulnerabilities. Expanded Vitest 4 and runtime checks supersede that initial checkpoint once they complete.

## 2026-10-03 — Validated local prototype

59 tests / eight files, typecheck and production build passed; audit reported zero known vulnerabilities. Real Codex Luna max authenticated inference and the food tool loop passed against mock data. Root browser walkthrough validated address selection, shortlist, explicit approval, ₹101.95 within-budget and ₹122.95 over-budget totals. Phone layout showed no horizontal overflow. These results supersede the initial partial-test checkpoint; evidence is indexed at repository `docs/VALIDATION.md` and `scripts/smoke-codex.ts`.

Codex startup originally failed because apps.enabled was an invalid connector configuration; apps._default.enabled and feature controls corrected it without new user authentication. An open SSE stream blocked app shutdown; preClose stream cleanup now has a real-HTTP regression test. Local preview was subsequently relaunched in a PTY after a process exit. These are local outcomes only.

Local production process tree measured about 269 MiB RSS after a chat/comparison. This supports trying the proposed 1 GB VM for one owner with builds elsewhere; actual peak/OS/proxy headroom remains unmeasured. A synthetic screenshot is local-only under .local/screenshots; private runtime content is excluded from public Git. Telegram tests use fake transport, Swiggy remains synthetic, and Azure/application/demo-video steps remain pending access.

## 2026-10-03 — Bundle optimization and saved directives

User added cheapest item/coupon combinations and agent-selected or explicitly requested saved directives. Root implemented same-restaurant observed bundles, exact line quantities, above-budget savings hypotheses, baseline plus up to three independently eligible non-payment coupons, and frozen approval plans visible in both channels. This supersedes the earlier one-coupon limit; discovery/trials remain bounded.

Encrypted runtime directives are shared by web/Telegram, serialized, deduplicated, capped and reviewable/deletable in Settings. Context refreshes each turn. They are separate from project/global Codex memory.

Final 73 tests/nine files and typecheck passed. Actual Luna max advanced smoke saved a synthetic directive and proposed exact dosa/idli bundle at ₹108 without any approval/cart write. Root browser verified manual directive persistence/delete plus exact thali/rice bundle approval and ₹217.30 SAVE20 total. Evidence: repository `tests/`, `scripts/smoke-codex-advanced.ts`, `docs/VALIDATION.md`; synthetic browser screenshot remains ignored/local. Dependency audit remains zero known vulnerabilities. Implementation publication/CI is the next bounded checkpoint.
