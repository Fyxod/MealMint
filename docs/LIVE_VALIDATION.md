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
