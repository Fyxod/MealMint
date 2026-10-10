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

## 2026-10-07 — Approved access and first real-account integration

User's approval email supersedes the pending application/access gate. Enabled hosted SWIGGY_MODE=live while leaving live quote validation false. Owner completed Swiggy consent/OTP; connected status and seven saved addresses survived release restart. Codex existing session connected, Luna max retained. Source 343c4b1 fixed address field mapping/freshness and connection indicator.

Actual gateway differs from the reference docs: restaurant search can return no dishes, full menu returns categories, and the collection filter is absent. First Luna max real search failed to shortlist because of these adapter assumptions; it made no cart changes. Added explicit dish-search join, categorized menu handling and synthetic regressions. Validation evidence is docs/LIVE_VALIDATION.md. Existing cart is nonempty, so any price probe requires exact app approval including discard consent. Raw responses remain protected on the VM and are not publication material.

## 2026-10-08 — Resumed live shortlist and Telegram readiness

Both account connections remained working. The resumed Luna max search published six real candidates, including three simple approved comparison targets, but hit the 180-second turn timeout before its final explanation. Increased turn allowance to 300 seconds while retaining explicit cancellation and bounded tool reads. Added frozen nonce-bound Telegram address choices so fresh Swiggy list ordering cannot silently change the selected address; stale choices are rejected. Typecheck, 77 tests and production build passed.

Owner supplied a Telegram bot token for protected configuration and authorized arbitrary cart modifications for testing. Store credential only in protected ignored local/VM locations; no value in memory/Git. Execute bounded comparison and verify actual totals/coupons/cleanup before declaring live quotes validated. No order/payment access is added.

## 2026-10-08 — Live interfaces, failure recovery and stale availability

Root deployed 2b60771, then17d643a/d53d9fe after controlled web/Telegram tests. Actual Luna max asked missing budget/address, presented valid choices, enforced required/max counts, preserved exact user-selected variants and returned observed payable snapshots ₹265/₹266/₹128/₹288/₹294 web and ₹267/₹300 Telegram. Earlier Makhani failure exposed Selected prefix on group rather thanchoice, corrected and live retested. Bot address/approval expiry and busy reset/cancel passed; fictional QA directive was shared acrosschannels/restart then forgotten and confirmed absent. Public demo remains synthetic. Source regressions expanded to178 passing tests/typecheck/build. Coupon recovery and mixed fixed-item trial logic were improved; real coupons did not produce savings in these completed checks.

A later mixed-roll live cart returned stock0 for both rolls although menus showedstock1. Swiggy get_food_cart statusCode8 contains readable item state, but old gateway threw before cleanup. Root preserved raw privately, confirmed exact approved IDs/qty, cleared only those testitems and confirmedstatus0/items0. New regression work reached205 passing tests/typecheck before private receipt extension. Strict cleanup excludes unapproved add-ons and missingidentity unless the exact freshcart matches the authoritative submitted write receipt hash; no providerdiagnostics/session IDs go to agenterrors. Source fixes still require final build/deploy/liveverification.

Dependency audit found critical shell-quote advisory through development-only concurrently. Added scoped override to1.12.0; lock changes only thatpackage, subsequent audit reports0. Private raw probes and screenshots stayignored/protected. Runtime source d53d9fe; current final fixes/public push are pending, not implied complete.

## 2026-10-08 — Receipt catalog mismatch isolated

Source5a29f22 pushed/deployed; CI37799018026 passed. Live unavailable-cart retest preserved the cart because write/read receipts differed. Protected paired response probe established only unused valid_addons catalog choices changed; selected contents, stock and pricing matched. Root cleared the exact test cart and independently confirmed empty. Final receipt excludes only that catalog and binds missing restaurant identity to the authoritative write request, retaining full ordinary concurrency checks. Actual saved response pair matches new receipt. Regression agent verified236 tests/13files and typecheck; production build passed. Automatic application cleanup still requires deployment/live evidence. Bot unrelated preference question did not repost prior cards. Service peak~351MiB, available363MiB, swap130MiB, no restarts; single-owner evidence only.

## 2026-10-08 — Consecutive cart reads also churn unused catalogs

Source0f237ce deployed/pushed with CI37801419849 success. Fresh Luna max exact two-roll comparison still stopped on stock0 with cleanup warning. A protected pair of consecutive get_food_cart responses differed only in unused valid_addons choices; receipt-only remedy was insufficient. Root verified exact approved one-each IDs/Regular Paratha/no-addons, cleared and confirmed empty0. Protected receipt-retest-read-pair.json and receipt-retest-cleanup.json retain evidence. Both fingerprint paths now exclude only unused valid_addons; selected contents, prices, offers, stock and identity remain protected. Built module matches actual saved read and write/read pairs; 248 tests/13files and typecheck passed, build passed. Agent added final-cleanup catalog churn plus eight genuine state-change regressions. Full application retest remains pending, not inferred from these checks.

## 2026-10-08 — Automatic unavailable-cart recovery passed live

Root hash-verified/deployed source1403bf6 (archiveSHA256 dc046bf9d07ff33da03a38b8df78a8e95110161cbd9bf4918880b1b4272975d2) using unchanged production dependencies. CI37803358065 passed. Fresh actual Luna max web configured one-each roll approval returned unavailable state. No quote, no cleanup warning; independent official read confirmed empty0 (protected final-automatic-cleanup.json). Private cropped proof .local/hosting/live-qa-cleanup.png contains no account location. This closes the unavailable cleanup bug, superseding prior remedy failures, not proving those rolls orderable. Telegram /help replied after restart; account status confirms connected live/paired, directives0. Service peak~352MiB, available355MiB, service swap~8MiB, whole VM swap109MiB, no automatic restarts. Security credentials/raw evidence mode600. Final normal Telegram comparison pending, then publication/docs handoff.

## 2026-10-08 — Quantity intent mismatch caught before cart writes

Final real Telegram Luna max request was exactly3CrispyVegBurgerOnly/noextras/₹300. Agent created a linequantity3 bundle and set request.quantity3, so frozen approval would write9 while narrative claimed3. Root cancelled before approval execution; bot confirmedStopped. This is a valid planning failure, not a price test. New shared cartPlanItems/cartPlanLabel makes both approval channels show actual total per-line counts using frozen request; agent bundle/compare responses expose authoritative final counts. System/tool prompts clarify request.quantity versus bundle-line quantities and require checking final counts. Twelve regressions cover3×3=9 visibility,3×1=3, mixed counts matching frozen approval/payload, and post-approval candidate mutation protection.260 tests/14files and typecheck passed; build passed. Source pending deployment/live retest; no success inferred from prompt edits.

## 2026-10-08 — Exact-count source deployed, retests running

Root built, hash-verified and deployed9375d54 using unchanged production dependencies, then pushed. CI37805533937 passed. Both interface fresh Luna max requests ask exactly3CrispyVegBurgerOnly/noextras with₹300budget; website will verify new visible approval totals then cancel, Telegram will execute only a correct3-item approval and independently confirm cleanup. No current comparison write before approval. Source260 tests/14files/typecheck/build pass. Remaining docs edits are uncommitted; final actual retest results still pending.

## 2026-10-08 — Correct exact-three quantities passed live

Fresh source9375d54 SAME natural Telegram request produced one configured CrispyVeg candidate repeated3, displayed explicit3× in approval and verified₹267.00 delivered for3items. No visible COD coupons. Web separately encountered an unavailable BK75rupee listing and stopped before approval; new Rominus3ItalianSamosa request showed correct3× in the new dashboard approval, then cancelled without writes. Private live-qa-telegram.png and live-qa-web-counts.png evidence retained. A visible native IAB tab now renders actual390×844 (no overflow), unlike the older hidden browser-use webtab1280; earlier viewport calls affected native Telegram. Phone approval check pending and override must be reset.

## 2026-10-09 — Actual phone-size pass and final account verification

Native visible IAB dashboard rendered390×844, documentwidth386, correct3ItalianSamosa approval with Cancel/Approve fully within viewport. Root cancelled read-only approval, reset temporary viewport; private live-qa-web-phone.png retained. This closes earlier hidden-tab phone coverage gap. Screenshot exposed food/rest label adjacency; minimal CSS block layout fixes it, build passed; visual deployment recheck pending. Independent official final cart read status0/items0 in protected final-telegram-empty-cart.json, directives0, connected modelgpt-6-luna/max/live/paired. Latest401/403/400 probes passed, resume200. Service peak~352MiB, available328MiB, swap119MiB, no restarts. Functional source9375d54 and CI37805533937 valid; style-followup and finaldocs publication remain.

## 2026-10-09 — Controlled live stage completed

Hash-verified sourcecc481a6 deployed/pushed; CI37842829952 passed260tests/14files/typecheck/build/memory/audit. Fresh actual phone Luna max3ItalianSamosa approval verified correctcounts, food/rest labels separate, bothbuttonsonscreen at390×844/documentwidth386. Cancelled read-only approval, resetoverride, closedtemporarytab, reloadedowner dashboard. Safe private finalphoneproof retained alongside earlier before-spacing image. Final official getcart status0/items0 in protected final-handoff-cart.json, directivecount0, modelgpt-6-luna/max/live/paired, app/health/resume200 and unsigned401. Servicecurrent~340MiB/peak~353MiB/swap~1.5MiB, available361MiB, wholeVMswap101MiB, noautomaticrestarts. Realcoupon savings unproven because freshCODoffersabsent; broad stage tests are complete. Final docs/memory are publicationcheckpoint artifacts; Git/CI terminal outcomes are verified at finalhandoff.

## 2026-10-09 — Savings objective reopened and real coupon discrepancy isolated

Owner rejected the ₹267 baseline. Fresh Luna max web comparison found three veg burgers at Meeting Point Pizza for₹191, versus₹267/₹330 alternatives. Separate4burger threshold probe cost₹249, so adding food worsened this cart. New source (uncommitted) fixes nested menu discovery, scoped search, explicit coupon coverage/payment text filtering, five trials, user-supplied coupon trials and paginated customization lookup. 304tests passed before further rejection/hint/pagination refinements; later319-test run needed one expected-error wording update, now made. Current full validation/deployment remains pending.

After BK reopened, actual3burger baseline still₹267. Owner screenshot showsFLAT100 on225cart. Official fetch withcodeFLAT100 still emptyCODlist; apply returns plain-textCoupon does not exist, cart retainscode butdiscount0/total267. Existing ownercart uses regular item116696296 (different from previouslytested156522424). Preservedownercart3items; do not claimempty. Full338-result scopedsearch failed to return regular116696296 or175816639 although compactmenu exposesboth. Source must distinguish missingdetails from unavailablefood. Protected optimization-flat100-*.json and optimization-bk-scoped-*.json evidence onVM, localprivate191screenshot. Research/evidence summary docs/OPTIMIZATION_RESEARCH.md; supportdraft private, notsent. Genuine BK savings unresolved; modelmustnotdefend267asoptimized.

## 2026-10-10 — Optimization source ready for live retest

341 synthetic tests/17 files passed, along with typecheck, production build and strict memory validation. New tests cover frozen user-supplied coupon hints, five-code bounded priority, later-page exact customization IDs/continuation and rejection-marker safety. Existing exact-count expectations now include the additional requestedCoupons field; no count checks removed. Fresh restaurant-search pages expose one Burger King outlet but cart merchant identity is absent, so an outlet mismatch is unproven. Exact FLAT100 with an immediately observed optional cartId again returned Coupon does not exist; same three regular burgers, zero discount and₹267 remain. Protected optimization-outlet-* and optimization-cartid-* retain raw evidence; cart preserved before deployment. Next required outcome is deployed actual Luna max web/Telegram behavior, not additional synthetic testing alone.
