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

The mixed Faasos two-roll check was a valid negative result: discovery said stock1, while get_food_cart returned statusCode8, both items stock0, and an unorderable ₹304 total. No quote was shown. The old adapter prevented cleanup reads; root verified the exact two approved test items, cleared only those and confirmedstatus0/items0. The updated adapter permits reading unavailable-cart state for identity/cleanup while refusing to quote it. A failed write can authorize cleanup only through exact approved contents plus matching restaurant identity, or a matching private provider write-receipt hash. Unknown, extra-addon and changed carts remain preserved. This boundary has synthetic coverage; final live retest remains pending until the new release.

Latest source check after these fixes: 221 tests/12 files and typecheck passed; production build and strict memory validation passed. A critical development dependency advisory was resolved with a scoped shell-quote override; npm audit reports zero vulnerabilities.
