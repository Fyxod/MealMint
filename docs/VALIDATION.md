# Validation record

2026-10-03, local Linux development machine, Node 24.19.0, Codex CLI 0.160.0, Vitest 4.1.11. Evidence is in this checkpoint's source/tests and `scripts/smoke-codex.ts`; no account transcript or credentials are included.

## Local checks

- TypeScript check and production build passed after the final source changes.
- 73 tests across nine files passed: OAuth PKCE/state and endpoint checks, encrypted stores and redaction, HTTP session/CSRF, food filtering, approval expiry/concurrency, cart change guards, three-candidate comparisons, coupon/cleanup behaviour, MCP error/quota handling, Telegram pairing/isolation/callbacks, bounded shutdown with an open SSE reader, exact same-restaurant bundles, coupon thresholds/lowest total/free-delivery, frozen approval plans, encrypted directive persistence/deduplication/capacity and directive API access.
- Full dependency audit reported zero known vulnerabilities after updating Fastify static serving and Vitest.
- Memory strict validation passed with zero errors or warnings. It does not prove semantic correctness or secret absence.

## Actual authenticated agent

The opt-in Codex provider smoke completed with selected model `gpt-6-luna`, requested effort `max`, and an existing ChatGPT sign-in. The real LLM set vegetarian / ₹120 / quantity one, used address/search tools, produced a two-dosa shortlist, stored an assistant reply, and created neither an approval nor any cart write. All food responses were synthetic. This validates authentication and the dynamic food-tool loop, not real Swiggy MCP access.

The advanced authenticated smoke (`scripts/smoke-codex-advanced.ts`) also passed on actual Luna max: saved the synthetic “Avoid peanuts” preference with user source, set veg / ₹250 / quantity one, searched and proposed exact plain-dosa/idli bundle (i7 + i8) at ₹108. It created no comparison and made zero cart writes. Its temporary encrypted preference store was removed after the run.

The first attempt was a valid startup failure: `apps.enabled=false` was interpreted as a connector configuration and rejected. The corrected `apps._default.enabled=false` plus disabled app/tool features passed the rerun. Initial 24-test/Vitest 3 results and failed npm 9 dependency update are superseded by the expanded checks and successful npm 11 update.

## Browser walkthrough

The production web app at `http://localhost:3000` was exercised through the browser with real Codex and mock food data: address selection → vegetarian dosa request → shortlist → two selected items → approval → verified synthetic totals. Plain dosa total ₹101.95 was within ₹120; masala dosa ₹122.95 was over budget. Displayed components matched the gateway totals. The test cart was cleared. Final emphasis/demo-label polish passed a fresh browser walkthrough. A phone viewport rendered at 386 CSS pixels with equal document/scroll width, showing no horizontal overflow; the normal viewport was restored. A synthetic-only screenshot is retained locally at `.local/screenshots/web-demo.jpg`, outside Git.

The expanded browser walkthrough passed with actual Luna max: it proposed exact Everyday Kitchen thali + dal-rice bundle at ₹218, displayed the frozen item plan for approval and verified ₹217.30 delivered with SAVE20 (lower than FLAT40). Manual synthetic directive save, persistence through reload and deletion passed in Settings. The bundle screenshot is local-only at `.local/screenshots/web-bundle.jpg`.

An observed restart hang with an open SSE connection was fixed by closing streams in Fastify's pre-close hook. The real-HTTP regression now confirms stream completion and bounded shutdown without a client abort. After a later local preview process ended, the preview was relaunched in a PTY; no remote uptime claim is made.

## RAM measurement

Standalone Codex smoke RSS: 106,820 KiB after account status and 164,364 KiB after a real turn. The running production app after browser chat/comparison measured Node 82,072 KiB + Codex 164,424 KiB + two helper processes 9,296/20,124 KiB, about **269 MiB total RSS** (shared pages may be counted more than once). This is a short local measurement, not peak/load testing or a VM capacity result. No browser, IDE, test runner or build process is included. A 1 GB VM is plausible for one owner with the build performed elsewhere; OS/proxy overhead and sustained load must be measured on Azure. Swap is only a burst buffer.

## External limits

At the original local checkpoint, no real Swiggy authorization, tool catalogue, menu units or cart was exercised. Telegram adapter tests use a fake fetcher; no real bot token was supplied or message sent. At that checkpoint, no Swiggy application had been submitted, public demo video published or Azure VM accessed. The later deployment update below supersedes the hosting/callback deferral; real Swiggy, Telegram and video gates remain pending. The architecture disables order/payment tools, but local tests are not production security certification.

## Published checkpoint

Implementation `c8345eda13e405c668a75028774efe8d33826d01` is on public main. [GitHub CI run 37117782107](https://github.com/Fyxod/swiggy-mcp/actions/runs/37117782107) succeeded with npm ci, typecheck, all 73 tests, production build, strict memory validation and dependency audit. Authenticated LLM/browser checks remain local opt-in checks, not CI tests.

## Azure deployment audit update

The supplied VM now serves https://foodfinder.parthkatiyar.xyz/ behind valid HTTPS. The remote runtime initially lacked Codex’s code-mode companion; that defect and a pre-existing Caddy ACME ownership problem were repaired. Actual Luna max food-tool dispatch and hosted browser bundle/approval/₹217.30 mock total passed. A saved fictional directive survived a service restart and was deleted afterward. Access controls and callback state rejection passed; the existing resume site remained 200. Service cgroup peak was about 326 MiB after one chat/comparison, with about 375 MiB OS available and no ongoing swap activity in short samples. Full evidence and limits: [deployment audit](DEPLOYMENT_AUDIT.md). No finished video, live Swiggy or real Telegram success is claimed.
