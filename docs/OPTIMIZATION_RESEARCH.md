# Optimization investigation — 9 October 2026

A verified cart price is not proof of optimization. The owner rejected the earlier ₹267 three-burger result and supplied evidence of a restaurant coupon that MealMint had missed. This investigation remains separate from the earlier integration/UI validation.

## Observed live outcomes

- Late-night Luna max web search, three carts: three veg burgers from Meeting Point Pizza returned ₹191 delivered; three cheese burgers there returned ₹267; three veg burgers at Punjab Mail Restaurant returned ₹330. These are dated snapshots, not current offers or a global minimum.
- A controlled four-burger threshold probe at Meeting Point returned ₹249, versus ₹191 for three. Crossing ₹199 did not by itself produce a visible coupon. Adding food would have worsened that result.
- When Burger King reopened, three burger-only Crispy Veg burgers returned ₹267 (₹225 item subtotal). That is still only the undiscounted baseline.
- The owner's Swiggy app screenshot showed **FLAT100**, ₹100 off above ₹199, against a ₹225 cart. This contradicts any conclusion that the account has no coupon.
- On the owner's existing three-burger cart, official MCP `fetch_food_coupons` returned an empty `COD only` list even with `couponCode: FLAT100`. A direct `apply_food_coupon` call returned the plain-text error `Coupon does not exist`. The subsequent cart retained the code but reported zero coupon discount and ₹267 payable. The owner's cart was preserved at this diagnostic checkpoint. The screenshot establishes offer visibility; a discounted final checkout total was not independently verified through MCP.
- Menu and scoped-search results also disagree. Burger King's compact menu exposed three distinct Crispy Veg item IDs, while a full 338-result scoped search did not return two of them, including the listing in the owner's current cart. Missing customization details must not be described as confirmed out-of-stock.
- Follow-up on 10 October: four fresh restaurant-search pages returned only one Burger King outlet, but the account cart omits its merchant ID; an outlet mismatch is not established. Applying FLAT100 with the immediately returned optional `cartId` still returned `Coupon does not exist`, with the same three regular burgers and zero discount/₹267 afterward. This rules out omission of that optional parameter as a sufficient fix in this check.

Raw authenticated payloads, the owner's screenshot, precise location, runtime transcripts and support report IDs remain in protected ignored storage. Public records contain only the minimum non-identifying findings. VM evidence uses `/var/lib/mealmint/validation/optimization-*`; private web proof is `.local/hosting/optimization-web-191.png`.

## Implemented response (deployment/live retest tracked in project memory)

- Read nested menu categories and retain distinct same-name item IDs; scope additional searches to an observed restaurant with fresh opening-status checks.
- Follow customization search pages with bounded continuation. Distinguish incomplete discovery, missing details and explicit stock failure.
- Replace the broad serialized-JSON payment-word filter with offer restriction checks, including explicit COD compatibility. Try up to five eligible codes, and expose visible/tried/rejected/untried coverage on web and Telegram.
- Let the agent queue a code explicitly supplied in the user's chat for an approved trial, even when coupon discovery is empty. Freeze and display that code in the approval. Reject invented codes and reset hints when meal preferences/location change.
- Recognize narrow, known plain-text coupon rejections without leaking provider diagnostics. A rejected zero-saving marker can be cleared only when all normal approved-food/cart checks still match; uncertain errors or genuine changes still stop.
- Prompt the agent to optimize against actual food needs and delivered budget, investigate challenged baselines, avoid needless over-budget alternatives and disclose conflicts between the app and MCP.

## 10 October live interface retest

Source `905ec18` was hash-verified, deployed and pushed; [CI 38051969221](https://github.com/Fyxod/MealMint/actions/runs/38051969221) passed. Both application agents used actual `gpt-6-luna` / `max` with the authenticated gateway.

- Telegram's natural exactly-three-burger/₹200 request shortlisted only three Veg Grilled Burgers at The Crosta (₹171.60 listed). After frozen discard/count approval, the application verified **₹198 delivered for three items**, reported no COD-compatible coupons returned and cleared the test cart. This is a dated alternative restaurant result, not Burger King savings or a global minimum.
- The dashboard froze exactly three accessible Burger King Crispy Veg Burger / Burger Only selections and explicitly displayed the requested FLAT100 trial. The application returned **₹267, over budget**, `attempted: FLAT100`, `rejected: FLAT100`, without counting savings or a cleanup warning.
- An independent official cart read after both comparisons is the cleanup evidence (protected `optimization-postcomparison-cart.json`). Cropped UI proofs remain private: `.local/hosting/optimization-telegram-198.png` and `.local/hosting/optimization-web-flat100.png`.
- The initial dashboard run in strict vegetarian mode could not compare a configured choice whose diet metadata was unknown. It preserved the filter but explained the failure too vaguely and exhausted further reads. The controlled coupon diagnostic then explicitly permitted any diet. Follow-up source reports the exact diet mismatch and requires asking before relaxing the filter.
- That initial agent answer also misattributed the user's reported FLAT100 terms to the gateway. Fresh default/specific-code lookups were empty; a prompted follow-up correctly separated the user hint. Follow-up source adds explicit discovery provenance/returned-code fields and corresponding instructions rather than accepting that wording as a pass.

The follow-up source has 343 passing synthetic tests; deployment and fresh wording checks are recorded separately in project memory. These fixes do not create an offer the official gateway rejects.

## Research and how it is used

| Source | Evidence or idea | Application / limit |
|---|---|---|
| [Official coupon reference](https://mcp.swiggy.com/builders/docs/reference/food/fetch_food_coupons/) | Optional `couponCode`, contextual eligibility, APPLICABLE/APPLIED/NOT_APPLICABLE and filter metadata. | Use fresh provider state and explicit trial coverage. An empty filtered list does not establish absence of all app offers. |
| [Official menu reference](https://mcp.swiggy.com/builders/docs/reference/food/get_restaurant_menu/) | Documents flat deduplicated menus and truncation; the authenticated live catalogue instead describes paginated nested categories. | Support both shapes; current authenticated schema and actual payloads take precedence over stale examples. |
| [Swiggy's Burger King outlet page](https://www.swiggy.com/city/patiala/burger-king-urban-estate-phase-ii-patiala-rest655020) | Public menu shows separate combo/value sections and advertised promotion codes on selected dishes. | Discovery leads only. Cached/public pages do not prove account eligibility or current payable amounts. |
| [Swiggy MCP toy client](https://github.com/Atishyy27/swiggy-mcp-toy) | Client author describes coupon display-code versus opaque-ID distinction. | Corroborates the existing adapter rule; no code executed or credentials shared. |
| [Swiggy CLI](https://github.com/HKTITAN/swiggy-cli) | Runtime schema discovery and defensive session handling. | Use the live tool catalogue, not old hard-coded documentation. No third-party client installed. |
| [Promotion engine](https://github.com/cloudspiral/pricing-rules-engine) | Small bounded combination search, explicit exclusion rules and transparent fallback coverage. | Design inspiration, not a source of Swiggy pricing rules. Swiggy cart totals remain authoritative for MCP quotes. |
| [Owner reports on discounted-item exclusions](https://www.reddit.com/r/swiggy/comments/1wotjgy/swiggy_black_member_horrible_experience/) | Anecdotal reports that some coupons exclude pre-discounted items. | Hypothesis to test across distinct real SKUs; not proof that a particular coupon works. |
| [Older YouTube deal example](https://www.youtube.com/watch?v=77U0eyR7fWM) | Time-limited Burger King promotion content. | Too old and campaign-specific to treat as a live offer. No redemption/account-reset schemes adopted. |

## Remaining evidence gap

The exact FLAT100 discrepancy needs resolution at the official gateway, or an independently verified alternative supported by that gateway. Do not represent source fixes, synthetic tests, the ₹191 result at a different restaurant, or a printed zero-discount coupon marker as proving Burger King coupon savings. A protected support draft is prepared locally; no support message has been sent.
