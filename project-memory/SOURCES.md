# Sources and verification limits

Checked 2026-10-03:

- [Swiggy quickstart](https://mcp.swiggy.com/builders/docs/start/developer/) and [onboarding](https://mcp.swiggy.com/builders/docs/operate/access/): local stubs precede staging; production after review. Quickstart staging phrasing differs from onboarding.
- [Application form](https://docs.google.com/forms/d/e/1FAIpQLSfUhtaGOQjnxS0o8uHFZwZGNxJhJzyYhxiYVotlqdBCpizpUw/viewform): browser inspection showed required production redirect URI and publicly viewable demo video.
- [Food tool reference](https://mcp.swiggy.com/builders/docs/reference/food/): paginated discovery, contextual offers, and mutating cart tools. Live schema/units and coupon availability still need validation.
- [Swiggy auth](https://mcp.swiggy.com/builders/docs/start/authenticate/): PKCE, DCR, code/state callback, five-day token; refresh issuance not wired despite metadata grant advertisement.
- [Rates](https://mcp.swiggy.com/builders/docs/operate/rate-limits/): 70 total and 30 write requests/minute per account/server; persistent sessions.
- [Data handling](https://mcp.swiggy.com/builders/docs/operate/data-and-compliance/): immediate-task use, minimization, additional requirements for processing outside India.
- [Codex app-server](https://learn.chatgpt.com/docs/app-server): authentication, ephemeral threads, streamed events, experimental dynamic tools. Runtime CLI-generated protocol examined locally.
- [Self-hosted VM sign-in](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms): supported eventual VM auth must be verified before deployment.
- [Telegram API](https://core.telegram.org/bots/api): long polling and inline callback buttons.
