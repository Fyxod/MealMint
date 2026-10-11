# Sources and verification limits

Checked 2026-10-03:

- [Swiggy quickstart](https://mcp.swiggy.com/builders/docs/start/developer/) and [onboarding](https://mcp.swiggy.com/builders/docs/operate/access/): local stubs precede staging; production after review. Quickstart staging phrasing differs from onboarding.
- [Application form](https://docs.google.com/forms/d/e/1FAIpQLSfUhtaGOQjnxS0o8uHFZwZGNxJhJzyYhxiYVotlqdBCpizpUw/viewform): initial browser inspection showed required production redirect URI and public demo video. Later sign-in-gated page metadata reinspection confirmed technical fields plus legal identity/acknowledgement section; no form submitted.
- [Food tool reference](https://mcp.swiggy.com/builders/docs/reference/food/): paginated discovery, contextual offers, and mutating cart tools. Live schema/units and coupon availability still need validation.
- [Swiggy auth](https://mcp.swiggy.com/builders/docs/start/authenticate/): PKCE, DCR, code/state callback, five-day token; refresh issuance not wired despite metadata grant advertisement.
- [Rates](https://mcp.swiggy.com/builders/docs/operate/rate-limits/): 70 total and 30 write requests/minute per account/server; persistent sessions.
- [Data handling](https://mcp.swiggy.com/builders/docs/operate/data-and-compliance/): immediate-task use, minimization, additional requirements for processing outside India.
- [Codex app-server](https://learn.chatgpt.com/docs/app-server): authentication, ephemeral threads, streamed events, experimental dynamic tools. Runtime CLI-generated protocol examined locally.
- [Self-hosted VM sign-in](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms): VM credential transfer/refresh guidance; Codex CLI authentication docs also allow protected SSH transfer. Existing VM CLI session was copied privately to the dedicated service owner and actual inference verified.
- [Telegram API](https://core.telegram.org/bots/api): long polling and inline callback buttons.

Deployment/readiness evidence is maintained at repository `docs/DEPLOYMENT_AUDIT.md`; video and application handoffs at `docs/VIDEO_BRIEF.md` and `docs/APPLICATION_PACKET.md`. No secret values or legal identity data are included.

Finished public video evidence is indexed at repository `docs/VIDEO_DELIVERY.md`: fresh actual hosted Luna max flow with synthetic data, full decode, anonymous public hash/range checks and browser playback. Media and proof screenshots remain ignored under `.local/hosting/`; no live Swiggy or Telegram claim.

2026-10-07: User-supplied approval email plus completed owner OAuth supersede the application gate. Read-only production `tools/list`, address, search, categorized menu, coupon and current-cart probes revealed differences from the reference docs. See repository `docs/LIVE_VALIDATION.md`; raw account data stays protected on the VM. Live price comparisons are not established by schema inspection alone.

2026-10-11: [Official current-cart reference](https://mcp.swiggy.com/builders/docs/reference/food/get_food_cart/) confirms read-only behavior and that printed code/zero discount is not proven applied savings. [Coupon reference](https://mcp.swiggy.com/builders/docs/reference/food/fetch_food_coupons/) describes COD-compatible filtering; that does not establish that the owner's FLAT100 itself has a payment restriction. Actual mobile screenshots and protected gateway reads, source0e241d4/CI38092605602 and both-interface proofs are indexed in repository docs/OPTIMIZATION_RESEARCH.md. Status6 availability handling is based on observed explicit stock0, not a documented symbolic status meaning.
