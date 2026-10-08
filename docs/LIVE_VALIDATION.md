> Current checkpoint — 2026-10-09: controlled live web, Telegram and actual phone-size checks are complete. Source cc481a6 is deployed;260 automated tests and source CI passed. The final section below records cleanup, exact quantities, account state and remaining coupon coverage limits. Earlier dated pending statements are historical.

# Live integration validation — 2026-10-07

The owner supplied Swiggy's approval email and completed the official consent/OTP flow. Production callback remains `https://mealmint.parthkatiyar.xyz/auth/swiggy/callback`. Hosted mode is now live; Codex remains `gpt-6-luna` with max reasoning. No new Codex authentication was needed.

## Confirmed against the authenticated gateway

- OAuth registration, PKCE callback and encrypted token persistence succeeded. Hosted `/api/status` confirms connected after restart.
- `tools/list` returned 20 tools. MealMint continues to allow only its nine discovery/cart tools; no payment, order, address mutation or reporting tools.
- `get_addresses` returned seven addresses. Actual fields are `addressLine`, `addressCategory`, `addressTag`; mapping, pagination and fresh fetching replace the old indefinite address cache. No phone numbers enter the app address model.
- Live `search_restaurants` returned open restaurants with an empty dish list. The initial actual Luna max search therefore could not produce candidates. Fixed by joining `search_menu` results to observed open restaurant metadata, retaining fail-closed availability checks.
- `get_restaurant_menu` returns paginated `categories[].items`, rather than the flat documented format. The adapter accepts both, exposes category pagination and reports incomplete coverage.
- Current live `search_restaurants` input schema has no `collection` property. The unsupported budget storefront filter is rejected explicitly rather than claiming it scoped the search.
- `update_food_cart` item identity is `menu_item_id`, required with quantity. Live write validation remains pending.
- Coupon responses use `coupon_sections[].coupons`, with `id`, `applicable` and descriptive terms. Real coupon application still needs an approved cart probe.
- `get_food_cart` returned the documented nested pricing fields. Existing account cart is nonempty; do not discard it without exact app approval.

Raw account responses and schema probes are private, mode 0600, under `/var/lib/mealmint/validation` on the VM. They must not be copied into Git or public demo media. Regression fixtures in `tests/service.test.ts` are synthetic. The public video remains a synthetic walkthrough.

## Remaining checks

Rerun the user's actual food search after the adapter deployment. Verify item/quantity identity, price units, coupon discounts and cleanup through a concretely approved cart comparison before claiming live quotes validated. Telegram still needs a dedicated BotFather token and real private-chat pairing. Live writes remain disabled during read validation.

## 2026-10-08 continuation

The actual Luna max search published six real options after the adapter fix. Its final explanation hit the 180-second deadline; runtime allowance was increased to 300 seconds. Telegram address callback identity is now frozen with an expiring nonce, independent of fresh Swiggy address ordering. Typecheck, 77 tests and production build passed.

Owner supplied a dedicated Telegram token and explicitly authorized modifying/clearing the account cart for bounded tests. The initial quote gate may be opened for this controlled owner-approved validation; that configuration alone is not evidence of correct delivered totals. Record actual quote/coupon/cleanup outcomes below before claiming success. Credentials and private account choices remain outside this document.

## 2026-10-08 cart/customization findings

Owner completed Telegram pairing and explicitly authorized bounded cart mutations for tests. Initial approved multi-cart check stopped safely: numeric live menu_item_id differed from the string candidate ID. Controlled burger-combo baseline probe returned ₹266 payable and cleanup confirmed empty cart. Source now normalizes exact identifier types and rejects unavailable numeric stock values.

Live offer id is an internal UUID; redeemable codes come from explicit code or the description (for example, a display title can differ from the actual code). The new adapter never sends UUIDs as couponCode. Coupon application and full comparisons still require runtime validation after deployment.

Variant menus can flatten required add-on groups from multiple meal variants, and cart valid_addons uses paise prices while scoped menu prices use rupees. Do not add these prices together. A variants-only Burger King probe returned INVALID_ADDON; including the observed fixed zero-price item selection produced the intended Burger Only variant at ₹128 payable. Cleanup confirmed empty cart. The adapter retains exact variant IDs, separates fixed structural choices from extras, permits only approved fixed alternatives, and verifies actual cart choices. Ordinary required-group minima remain enforced; flattened minima are conditional and validated by Swiggy. Failed or uncertain transport writes are never automatically retried.

Owner paused tests to use the app, then explicitly resumed. All raw responses remain protected on the VM. Website/Telegram choice flows, final coupon outcomes and cleanup are the next validation stage; source checks passing are not substitutes for that evidence.

## 2026-10-08 live interface pass

These controlled owner tests supersede the earlier missing-access/token and disabled-write statements. Runtime source d53d9fe is deployed; real Codex agent remains gpt-6-luna/max. The account owner authorized bounded cart edits/clearing. Orders and payments remain excluded. The public demo stays synthetic.

| Actual interface scenario | Observed outcome |
| --- | --- |
| Web: missing budget/address | Agent asked before discovery; no cart writes. |
| Web: combo required/max choices | Empty required choices and excess sides rejected before writes; selected exact fixed burger choices plus cheese. |
| Web: exact two-cart comparison | Configured two-burger/cheese combo ₹265; burger plus fries ₹266 payable. Empty cart verified afterward. |
| Web: stop → reopen choices | Initially exposed stale cancellation flag; corrected and live retest opened the variant dialog without error. |
| Web: explicit Burger Only variant | Exact radio selection saved; approved payable total ₹128; no extras. |
| Telegram: new chat/saved address/manual choices | Fresh saved-address selection, required-variant rejection, group navigation, exact Burger Only save succeeded. |
| Telegram: three burgers | Crispy Veg ₹267; Makhani initially failed a fixed-group mapping, then corrected manual choice test verified ₹300 payable. |
| Web: multi-item quantities | Three Italian Samosas ₹288; one parcel + one burger + one samosa ₹294 payable. Both within ₹300. |
| Cross-channel directives | Explicit fictional QA directive saved in bot, read by web, survived restart, then forgotten through bot. API confirmed absent and fresh web turn saw no saved directives. |
| Telegram: busy/reset/cancel | Busy /new rejected; /cancel completed; no order/payment tools were exposed. Agent also explicitly declined ordering/payment. |
| Telegram: stale controls | Used approval rejected; address buttons from before restart rejected as expired. |
| Fresh account offers | Burger King, Rominus, KFC, Wendy’s and Domino’s read probes returned no visible COD offers with an empty cart. Completed price checks above showed no coupon discount. This does not establish coupon-application success. |

The current official tool schema and response summary filter coupons to COD-compatible offers. Online/card-only discounts may be absent. No global-cheapest or all-restaurants claim is supported. Item/variant prices remain unverified until the approved cart quote; configured menu prices are not summed. Exact counts are reported without invented weights/fullness.

Source fixes include numeric item identity, distinct redeemable codes rather than UUIDs, conditional variant-group handling, bounded approved fixed-choice combinations for mixed carts, partial-comparison context, cancellation recovery, and protection against stale Telegram output. Confirmed rejected coupons can be skipped only after an unchanged-cart check, retaining verified totals; transport uncertainty still aborts and unsafe carts are preserved. These failure cases have synthetic regression coverage, not manufactured real-account failures.

Latest local validation: 178 tests across 12 files, typecheck and production build passed. API probes: unsigned account APIs 401, missing/wrong-origin session CSRF writes 403, invalid OAuth callback 400. Desktop layout checked at actual 1280×720 without horizontal overflow. A browser viewport override did not change the actual page size, so this pass does not claim a new phone-size live check.

Private screenshots/probes stay ignored under .local/hosting and protected /var/lib/mealmint/validation; no account addresses, credentials or raw payloads are published.

### Stale-availability failure and cleanup boundary

The mixed Faasos two-roll check was a valid negative result: discovery said stock1, while get_food_cart returned statusCode8, both items stock0, and an unorderable ₹304 total. No quote was shown. The old adapter prevented cleanup reads; root verified the exact two approved test items, cleared only those and confirmedstatus 0/items 0. The updated adapter permits reading unavailable-cart state for identity/cleanup while refusing to quote it. A failed write can authorize cleanup only through exact approved contents plus matching restaurant identity, or a matching private provider write-receipt hash. Unknown, extra-addon and changed carts remain preserved. This boundary has synthetic coverage; final live retest remains pending until the new release.

Latest source check after these fixes: 221 tests/12 files and typecheck passed; production build and strict memory validation passed. A critical development dependency advisory was resolved with a scoped shell-quote override; npm audit reports zero vulnerabilities.

### Final live cleanup verification — source 1403bf6

The receipt-only fix in 0f237ce did not complete cleanup: two consecutive live cart reads also changed unused valid_addons catalogs. Protected receipt-retest-read-pair.json shows only those possible-choice fields changed, while selected food remained identical. Root verified the exact authorized test contents and cleared them; receipt-retest-cleanup.json confirms empty0. This failure supersedes the earlier assumption that ordinary fingerprints should include possible-choice catalogs.

Both receipt and concurrency fingerprints now exclude only unused valid_addons. Actual selected items, quantities, variants/add-ons, item prices, stock, offers, payable total and restaurant identity stay protected. Twelve additional regressions cover catalog churn through final cleanup and preservation on actual selected-state changes. All 248 tests across 13 files and typecheck passed; production build and strict memory validation passed. [CI37803358065](https://github.com/Fyxod/MealMint/actions/runs/37803358065) completed successfully for source 1403bf6.

Fresh deployed Luna max web flow used one Pindi Chole Roll and one Chatpata Double Egg Roll, Regular Paratha/no optional extras, frozen together by exact approval. Swiggy again returned out-of-stock state. MealMint showed no quote, reported unavailability and automatically cleared the exact test cart without a cleanup warning. An independent official get_food_cart read confirmed status 0/items 0; protected evidence is /var/lib/mealmint/validation/final-automatic-cleanup.json. The private cropped UI proof is .local/hosting/live-qa-cleanup.png. This is a successful unavailable-cart recovery check, not evidence that those rolls can be purchased.

A real gateway rate limit initially blocked search/address selection; the app made no cart write, surfaced the error, and a deliberate retry after cooldown succeeded. The agent asked before substituting a differently named menu entry. Telegram /help replied after the final restart, confirming persistent pairing/polling. Latest account API confirmed Codex connected (gpt-6-luna/max), Swiggy connected/live, Telegram configured/paired and zero saved QA directives. Earlier fresh security probes on0f237ce returned unsigned401, missing/wrong-origin CSRF403 and invalid OAuth callback400; the final code changes affect only cart fingerprinting.

Final release1403bf6 is served through an absolute current symlink; transfer SHA-256 dc046bf9d07ff33da03a38b8df78a8e95110161cbd9bf4918880b1b4272975d2 matched before extraction. Production dependencies were unchanged and copied from the previous release; VM has no npm, and builds/tests remain local/CI. Service active with no automatic restarts; health/resume200. Current~339MiB, peak~352MiB, service swap~8MiB, VM available355MiB/842MiB and swap109MiB/2GiB. Short vmstat sampling showed small intermittent swap activity, not evidence of sustained pressure or load capacity. No RAM upgrade or new interactive authentication is needed for the observed owner workload.

Real coupon savings remain unproven because fresh eligible COD offers were absent. Synthetic coupon acceptance/rejection/baseline recovery is covered; do not promote it into real savings evidence. Current live phone-size testing also remains incomplete: viewport controls did not change actual1280×720. Desktop verification and earlier synthetic mobile/video checks are separate evidence.

### Exact quantities exposed to the agent and both approval channels

A final Telegram happy-path request caught another valid planning failure before writes: exactly three burgers was represented as a line quantity 3 bundle repeated three times. The narrative said3, but the frozen cart would have held9. Root cancelled; the bot confirmed Stopped, and no comparison executed. It is not recorded as a price success.

Source 9375d54 adds a shared per-item total-count formatter to web and Telegram approval screens, using the frozen request multiplier. Agent food_bundle responses return finalItems and food_compare returns exact frozen plans/items. System and tool instructions distinguish three single burgers from three copies of a three-burger bundle and require checking authoritative final counts against the request. Existing legitimate repeated bundles remain supported. Twelve regressions verify3×3=9,3×1=3, mixed-line totals matching frozen plans/write payloads and protection against later candidate mutation. All 260 tests/14 files and typecheck/build pass; [CI37805533937](https://github.com/Fyxod/MealMint/actions/runs/37805533937) succeeded.

Release9375d54 was hash-verified before deployment (archive SHA-256 b9cfd344b1343a01ab04cbf39937199e0f40d1417468d3af44efb28993e3e6c1), retaining unchanged production dependencies and protected runtime state. Fresh same-language Luna max quantity retests are recorded below when complete; prompt changes alone do not establish correctness.

### Completed controlled live stage — 2026-10-09

Fresh source 9375d54 SAME natural-language Telegram request correctly selected one configured Crispy Veg Burger repeated three times. Its approval displayed3×, and the approved check returned₹267.00 delivered for exactly three items, without optional extras or coupon discount. This supersedes the cancelled nine-item planning failure above. The private proof is .local/hosting/live-qa-telegram.png. A separate web listing at₹75 failed fresh customization availability; the agent stopped without a cart write rather than claiming a valid option. The next observed three-Italian-Samosa request displayed correct3× totals in web approval and was cancelled after inspection.

Actual native IAB phone checks rendered the live dashboard at390×844, document width 386. The exact3ItalianSamosa approval and both buttons fit within the viewport; no horizontal overflow. The earlier hidden browser-use dashboard stayed1280×720 while viewport controls affected native tabs. Those earlier failed override attempts are preserved as incomplete checks and superseded by these actual phone measurements. Source cc481a6 separates dish and restaurant details onto different lines; a fresh actual Luna max phone approval visually verified that spacing. Read-only approvals were cancelled, the temporary phone tab closed and the viewport override reset. Private proofs are live-qa-web-counts.png, live-qa-web-phone.png (before spacing) and live-qa-web-phone-final.png.

Final deployed release is /opt/mealmint/releases/cc481a6 through the absolute current symlink. Archive SHA-256 27a50d9a1dbcb04e41f283affc8b648db4e7514be0e9069437443a75d5d69292 matched before extraction. Production dependencies and protected runtime state were preserved. [Source CI37842829952](https://github.com/Fyxod/MealMint/actions/runs/37842829952) passed clean install, typecheck, all 260 tests/14 files, build, strict memory validation and dependency audit.

Final independent get_food_cart confirmed status 0/items 0 (protected /var/lib/mealmint/validation/final-handoff-cart.json). Saved directive count 0, Codex connected/gpt-6-luna/max, Swiggy connected/live and Telegram paired. The deployment restart cleared earlier test conversations; the dashboard was reloaded for a fresh owner conversation. Latest functional-source CSRF probes403 and invalid callback400 passed; final deployed app/health/resume returned200 and unsignedAPI401. No order or payment was made.

Final resource sample: service current356294656bytes (~340MiB), peak370106368bytes (~353MiB), service swap1564672bytes (~1.5MiB), zero automatic restarts. VM usable842MiB, available361MiB, swap101MiB/2GiB. This supports the observed single-owner use with off-VM builds; it does not establish sustained multi-user capacity. No new authentication or memory upgrade is required now.

Only unproven product outcome: real coupon savings. Fresh COD-compatible offer responses and completed live quotes had no eligible codes/discounts. Threshold combinations, distinct listed-price SKUs and rejected-coupon/baseline recovery have synthetic coverage and strengthened agent instructions, but no real savings are manufactured or inferred. Discovery is bounded and prices remain snapshots. Future real coupon checks require a freshly observed eligible offer and exact approval; no further broad tests are pending in this stage. All private screenshots/raw payloads remain excluded from Git/public demo.
