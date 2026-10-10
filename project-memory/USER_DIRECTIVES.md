# User directives

2026-10-03: Build an LLM-driven assistant to find cheap food and account offers through official Swiggy MCP. Users provide budget and preferences conversationally. Both web and Telegram are required; WhatsApp is later. Codex sign-in powers the LLM first; more provider authentication methods later.

Personal account first; compare any inexpensive food with opt-in shortlist cart changes, without placing orders. Create and push the public GitHub repo `Fyxod/swiggy-mcp`.

User specifies `/home/fyxod/Desktop/swiggy-mcp`, durable-project-memory skill, and Luna max for all tests. Azure VM access will be supplied later; proposed capacity 1 GB RAM / 2 vCPU needs measured validation. Notify user only when their participation in Codex authentication is actually needed.

Clarification 2026-10-03: Luna max is the actual agent LLM for Codex-auth and Swiggy MCP testing, rather than a requirement to delegate all checks. Subagents are allowed if useful. Report if VM memory needs increasing and whether swap is insufficient.

2026-10-03 additions: Root should create the product; Luna may verify it. The system prompt must seek item/quantity/coupon combinations that minimize the qualifying delivered cart total. Save useful stable user directives when the LLM judges them useful or the user explicitly requests remembering; share runtime preferences across web and Telegram with review/delete controls. This runtime directive store is separate from project memory.

2026-10-03 deployment authorization: Connect using local `droplet2`; use saved VM hosting/DNS credentials as needed; deploy at `foodfinder.parthkatiyar.xyz` and modify DNS for that deployment. Provide everything needed for the Swiggy Google form afterward. This supersedes the earlier hosting deferral. Keep secrets out of logs/Git.

2026-10-03 video/review additions: Create a polished MacBook-style walkthrough with large pointer, explanatory text and smooth motion. The user then requested an audit and a concrete video brief for Sol 6.1 to implement after this review. Preserve the hosted deployment objective; do not portray a finished video or live Swiggy/Telegram integration before validation. Agent tests still use Luna max.

2026-10-03 continuation: User now explicitly asks to create the video and complete any other pending work. This authorizes finished rendering/public demo publication rather than stopping at the review brief; preserve the private app and clearly label synthetic data.

2026-10-03 rename: User requests MealMint everywhere, including code, website and hosting. This supersedes the Foodfinder identity, domain and earlier checkout/repo naming. Use /home/fyxod/Desktop/MealMint, public repo Fyxod/MealMint, mealmint.parthkatiyar.xyz, and migrate service/data paths without losing credentials or preferences. Preserve dated historical records; prior names there are historical provenance only.

2026-10-07: User supplied Swiggy's live-access approval email and asks to finish remaining work. Owner completed official Swiggy consent/OTP. For the first real search: ₹300 delivered, good fast food, large amount, the selected saved hostel address. Treat these as this meal's request, not automatically durable food preferences. Preserve Luna max for actual agent tests; no cart writes without exact app approval.

2026-10-08: Owner supplied a dedicated Telegram bot token and explicitly authorized protected storage/configuration. Do not record the value. Owner also authorized modifying the Swiggy cart however needed for testing, including discarding current contents and clearing test carts. This covers the proposed three-cart price check and subsequent bounded validation; it supersedes the need to ask again for those test cart mutations. Orders/payments remain outside scope. Actual agent tests still use Luna max.

2026-10-08 additions: Enable customization choices/questions in both dashboard and Telegram rather than excluding such food. Optimize observed item/quantity/variant combinations for eligible coupons, including comparing a higher listed-price cart with a lower-priced ineligible cart. Never invent or force a Swiggy price. Owner logged Telegram into the in-app browser and explicitly asks for deep testing of both interfaces and iterative prompt improvements. Actual agent runs must remain gpt-6-luna/max. Test messages are authorized to the paired MealMint bot, not other Telegram recipients. Keep private account data/screenshots/transcripts out of public Git/demo artifacts.

2026-10-08 pause: Owner asks to stop testing so they can use the website and order food now. Provide their existing website access token privately in the conversation; do not store its value in project memory. Resume testing only when owner explicitly tells us to continue. No further cart mutations or deployments during this pause.

2026-10-08 resume: Owner explicitly asks to continue testing, revoking the temporary pause. Resume the authorized website/Telegram live tests and bounded cart mutations.

2026-10-09 optimization reopen: Owner rejects the ₹267 three-burger baseline as insufficient and expects the useful coupon combination below ₹200. Investigate actual coupon/SKU/threshold behavior and test whatever restaurants are currently open; keep refining web and Telegram through real Luna max runs and meaningful edge cases. Do not equate a verified baseline or passing integration tests with finding the cheapest meal, and do not guarantee a price unsupported by fresh cart evidence. Existing bounded cart-test, publication and hosting authorization persists.

2026-10-09 research and coupon correction: Owner asks for ongoing web research (official docs, GitHub, Reddit, YouTube or other sources) to improve the system and points out Burger King is now open. Owner then supplies a current Swiggy screenshot showing FLAT100, ₹100 off above ₹199 on a ₹225 cart. Treat that as evidence of a visible account offer; do not dismiss it because MCP discovery is empty. Test the exact code and distinguish gateway discrepancies from missing coupons. No support-message authorization was supplied.

2026-10-10 evidence correction: Owner supplies mobile screenshots proving FLAT100 applied to three regular Burger King Crispy Veg burgers at ₹159 payable, with non-discounted-item exclusion and two-hour reuse window; outlet locality Urban Estate Phase II. Preserve this cheaper existing cart while investigating app/MCP discrepancies. User authorizes normal Swiggy sign-in if needed; existing MCP connection works, so no new login is currently required. Never copy account/payment details from screenshots to public records.
