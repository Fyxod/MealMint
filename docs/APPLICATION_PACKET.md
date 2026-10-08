# Swiggy application packet

2026-10-03: The current [Google form](https://docs.google.com/forms/d/e/1FAIpQLSfUhtaGOQjnxS0o8uHFZwZGNxJhJzyYhxiYVotlqdBCpizpUw/viewform) requires Google sign-in to submit. Its public embedded field metadata was inspected without sending a response. No application or agreement was submitted.

## Prepared technical answers

| Field | Recommended answer |
| --- | --- |
| Applicant type | Individual Developer |
| Project | MealMint |
| Code / portfolio | https://github.com/Fyxod/MealMint |
| Application website | https://mealmint.parthkatiyar.xyz/ (owner access token required) |
| Server selection | Swiggy Food only |
| Integration category | AI Agent / Copilot |
| Production callback | https://mealmint.parthkatiyar.xyz/auth/swiggy/callback |
| Anticipated traffic | < 1K/day for the initial personal prototype |
| Demo video | https://mealmint.parthkatiyar.xyz/demo/mealmint-demo.mp4 (public, no sign-in; 58 seconds, 1080p). Watch page: https://mealmint.parthkatiyar.xyz/demo/ |

Only the callback URI belongs in the redirect field. Do not paste a temporary OAuth authorization link, client ID, token endpoint or localhost URL. [Swiggy auth docs](https://mcp.swiggy.com/builders/docs/start/authenticate/) require exact matching HTTPS callbacks and support dynamic client registration.

## Project explanation — ready to paste

MealMint is a personal AI food assistant available through web chat, with a private Telegram adapter. Users describe their delivery budget and food preferences. The agent searches relevant restaurants and dishes, inspects account-contextual coupons, and proposes same-restaurant item and quantity combinations that satisfy the request at a low delivered cost. This includes considering suitable small additions when they can unlock a coupon threshold and lower the actual total.

The app separates listed subtotals from verified payable amounts. Before any cart mutation, it shows the exact item plan and requires explicit approval. The backend compares baseline pricing and eligible non-payment coupons independently, verifies the returned cart contents and payable amount, and clears the expected temporary test cart. Existing items require an additional discard confirmation. Ordering and payment tools are not exposed. Results are the cheapest among inspected combinations, not a guaranteed minimum across every restaurant.

Stable user directives can be saved explicitly or inferred by the agent, shared between channels and reviewed/deleted in Settings. The current prototype uses real Codex inference with a clearly labelled synthetic Swiggy catalogue. Official OAuth and MCP transport are implemented; approved staging access is needed to validate real response schemas, pricing units, coupon fields and cart behaviour before enabling live comparisons. The initial service is for one owner, not an open multi-user service.

## Architecture — ready to paste

Node.js 24, TypeScript and Fastify host a React web chat with SSE. A Telegram long-polling adapter uses the same personal backend. Codex app-server uses the owner's ChatGPT session; agent tests run on gpt-6-luna with max reasoning effort. Only controlled food tools are exposed to the agent. The backend integrates with the official Swiggy Food endpoint through @modelcontextprotocol/sdk using Streamable HTTP. Swiggy authorization is separate OAuth PKCE S256 with state validation, dynamic client registration and an exact HTTPS callback. Swiggy tokens and saved directives are encrypted on disk; Codex CLI credentials remain in a protected owner-only file managed by Codex. The deployment uses systemd and Caddy TLS on the supplied Azure VM. Controlled owner-approved live cart comparisons are enabled after item/variant/quantity/price-unit/cleanup checks. The agent has no order or payment tools. See LIVE_VALIDATION.md for verified outcomes and remaining coupon limitations.

## Information the owner must supply personally

The form asks for contact name/email and a LinkedIn URL. Its legal section asks for identity-document name, date of birth, PAN, address, partner business category and an email for the agreement. Use your actual details directly in Google Forms; do not put them in this repository. A suitable category description for this project is “Food technology / consumer productivity.”

The form includes separate acknowledgements for integration terms and accuracy/authority of legal details. Read and decide on those yourself. It states that an integration agreement is sent for electronic signature and access follows receipt of the signed agreement. No legal identity values were collected or inferred here.

## Remaining review gates

The public demo video is published and verified. Supply a dedicated Telegram bot token before claiming a working Telegram demonstration. Obtain staging access and validate real Swiggy integration. For production, confirm processing-region and agreement requirements with Swiggy: the [data-handling guide](https://mcp.swiggy.com/builders/docs/operate/data-and-compliance/) requires a signed DPA and transfer safeguards when MCP responses are processed outside India. This packet is a technical project description, not a claim of production compliance.
