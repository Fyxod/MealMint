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

## 2026-10-03 — Public implementation checkpoint

Implementation commit `c8345eda13e405c668a75028774efe8d33826d01` was pushed to public main. [CI 37117782107](https://github.com/Fyxod/swiggy-mcp/actions/runs/37117782107) completed successfully with clean install, typecheck, 73 tests, build, memory validation and audit. Preview restarted from the final compiled source on localhost:3000, synthetic mode and Codex Luna max. External integrations remain pending; no user auth action was needed. This publication record is a separate memory follow-up, so its own commit does not imply another runtime change.

## 2026-10-03 — Authorized Azure deployment and audit

User authorized droplet2 access, saved DNS/hosting credentials, foodfinder.parthkatiyar.xyz and DNS changes. The supplied VM had 842 MiB usable RAM, an existing Caddy/resume service and no swap. Root built/packaged locally, verified transfer hashes, added 2 GiB swap and an isolated foodfinder service, used existing protected VM Codex auth, updated only target A record and preserved the resume service. Deployment release 7968d8e is behind HTTPS; owner token remains private.

Initial partial-transfer Node probe failed with SIGSEGV and is classified as invalid compatibility evidence. Caddy certificate issuance initially failed on root-owned ACME directories; correcting ownership resolved it. The first hosted LLM reply could not use tools; diagnostic observed zero calls and missing-code-mode-host errors. Installing the matching companion fixed actual Luna max context/preferences/search/present dispatch. Hosted browser subsequently passed agent remembering, exact thali/rice bundle, approval and ₹217.30 SAVE20 result. New comparison confirmed empty cart; directive survived restart and fictional preference was removed. External HTTPS health 200, unauthenticated API 401, callback without state 400, resume 200.

Service cgroup peak 342,274,048 bytes (~326 MiB), OS available ~375 MiB after one real chat/comparison. Sampled intervals showed no ongoing swap I/O; this supports the proposed single-owner VM, not sustained-load capacity. No interactive auth needed. Evidence is repository `docs/DEPLOYMENT_AUDIT.md` and local-only safe screenshots.

User requested a Mac-style pointer/caption video, then asked the temporary review model to audit and prepare Sol 6.1's implementation brief. No video rendering/public demo publication is claimed. Brief freezes an honest ~58-second actual-UI story, 1080p/30fps, large eased cursor, explicit approval and synthetic labels; render locally. Application packet includes exact live callback and technical answers. Public form metadata includes legal identity details/agreements, which remain user-owned. Telegram token and real Swiggy staging are still missing. Before final filming, clarify current-cart versus proposed-bundle coupon eligibility and remote Codex re-auth handling.

## 2026-10-03 — Finished public walkthrough

Root refined contextual coupon wording and deployed 4a9d4ff after typecheck/73 tests/build passed. Fresh hosted actual Luna max flow proposed exact thali + dal-rice bundle, saved the requested fictional preference and returned ₹217.30 with SAVE20 after explicit approval. Preference was deleted and workspace reset. Dependency audit reported zero vulnerabilities.

Root rendered locally with a reproducible Pillow/FFmpeg pipeline and measured cursor manifest: 58 seconds, 1080p/30fps H.264/yuv420p/faststart, no audio. All 1,740 frames decoded cleanly. Contact-sheet/final-frame inspection found pointer overlap with the price; it was corrected before publication. The reviewed synthetic video, poster and HTML are public at `/demo/` through isolated Caddy static serving. Anonymous HTTPS returned 200, video ranges 206 and public SHA-256 matched local. Browser playback advanced to 58 seconds/end without error; phone-width DOM layout had no horizontal overflow and video playback continued. App unsigned API remained 401 and resume 200. See repository `docs/VIDEO_DELIVERY.md` for exact media evidence. Application packet now supplies a verified public video link and callback; no application submitted.

Current short VM sample had ~329 MiB service peak, no service swap and 384 MiB OS available. No RAM upgrade or interactive Codex auth is required now. External gates remain dedicated Telegram token, approved Swiggy/staging validation and owner legal/contact form fields. Screenshots/video and credentials are excluded from Git; renderer/docs and evidence index are published.

## 2026-10-03 — MealMint identity and hosting migration

User explicitly requests MealMint everywhere, superseding earlier Foodfinder naming. Root renamed GitHub repo to Fyxod/MealMint and authoritative local checkout to /home/fyxod/Desktop/MealMint. Source/UI, npm package, temporary prefixes, Codex/MCP/OAuth client identities, Telegram pairing greeting, cookie and hosting templates were updated. Existing cookie/session and OAuth tests passed. A branding-specific Telegram greeting assertion initially failed, was updated to the new expected message, and all 73 tests/typecheck/build passed. Source commit 5078ba4.

GoDaddy's saved credential is a Bearer PAT, not an API-key/secret pair: initial sso-key read failed 401; authorized Bearer read succeeded. Only the target mealmint A record was set to the supplied VM, TTL 600; readback and resolution passed. No secret value was printed. The mealmint user keeps original UID/GID while HOME, service, state/env/runtime/public paths moved; owner session and encryption keys retained. Old service disabled/removed, new unit active; swap path and fstab migrated. New domain HTTPS/API/callback checks passed, existing resume stayed 200, old domain redirects 308.

Fresh hosted actual Luna max flow on new domain saved a fictional directive, proposed the exact ₹218 bundle and returned ₹217.30 after explicit approval; directive removed. Captures were refreshed under .local/hosting/mealmint-demo with actual desktop MealMint branding; a temporary viewport override was reset. Local preview restarted under new checkout. Video rerender/publication and final source/doc push are the next bounded steps. Older source/releases/captures and dated names remain historical rollback provenance only.

## 2026-10-03 — MealMint media/publication completion

Fresh MealMint captures were rendered into a new 58-second 1920×1080/30fps H.264/yuv420p/faststart MP4, 1,740 frames, 3,180,440 bytes, SHA-256 ad8d0c076113a8450618657f3c0aaceac81e926cb49fec19451715fe8dcef630. Full decode and contact-sheet inspection passed. New public page/video/poster returned 200, ranges 206, and downloaded hash matched local. Browser playback ended at 58 seconds without errors; title/body contained MealMint and no prior brand. Old domain/video links redirect to the corresponding new URLs. Active old public MP4 removed, original media retained privately for historical provenance. Application packet and current memory now point to new domain/repo/callback. Full evidence: repository docs/VIDEO_DELIVERY.md; ignored local .local/hosting/mealmint-app.png and mealmint-public-demo.png. Final rename/docs commits are pushed under the public MealMint repository; check latest Git/CI status before resuming.
