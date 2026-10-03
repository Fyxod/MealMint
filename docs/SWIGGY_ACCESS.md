# Swiggy access and application plan

The official MCP can support account-linked dish discovery, menus, contextual coupons and cart totals. It has no documented endpoint for the cheapest delivered meal across all restaurants. The LLM can explore queries and pages, while the backend ranks observed prices and approved cart snapshots.

The [developer guide](https://mcp.swiggy.com/builders/docs/start/developer/) starts with a prototype. The [access guide](https://mcp.swiggy.com/builders/docs/operate/access/) describes local stubs, reviewed staging access, and production eligibility after staging validation. The actual [application form](https://docs.google.com/forms/d/e/1FAIpQLSfUhtaGOQjnxS0o8uHFZwZGNxJhJzyYhxiYVotlqdBCpizpUw/viewform) was inspected on 2026-10-03: it requires a production redirect URI and a publicly accessible demo video. Its callback requirement is stricter than the local development example. Verify it again before submitting.

## Prototype and public callback

This repository provides the web/Telegram prototype and local OAuth callback handler. The supplied Azure VM is deployed behind HTTPS. Current values:

```dotenv
APP_ORIGIN=https://mealmint.parthkatiyar.xyz
SWIGGY_REDIRECT_URI=https://mealmint.parthkatiyar.xyz/auth/swiggy/callback
```

The URI is the destination for the authorization code and state. It is not a webhook or a token endpoint. This exact handler is reachable over public HTTPS; invalid/missing state is rejected. This does not establish completed Swiggy authorization. Local development uses `http://localhost:3000/auth/swiggy/callback`; localhost is unsuitable for the application form's production URI field.

Record a short public demo using synthetic data, explicitly labelled. Show budget/preferences in chat, saved address selection, discovery, shortlist, approval, delivered-total comparison and Telegram interaction. A synthetic demo proves the prototype flow, not live access. Include the public repository URL, deployment URL, exact callback URI and honest staging requirements in the application. Application submission and public video publication are still pending. The current form’s public metadata was re-inspected; prepared technical and owner-only legal fields are indexed in [the application packet](APPLICATION_PACKET.md).

## Staging validation before live writes

After approved credentials/access:

1. Complete OAuth and verify `tools/list`, valid addresses and read-only food searches. Confirm actual output envelopes, string/numeric pagination fields, menu price units, stock and OPEN status.
2. Confirm the documented menu ID maps to the exact `update_food_cart` field. Validate baseline cart content, `pricing.to_pay`, coupon applicability/code mapping and applied discount. Use an empty cart with user approval.
3. Validate address changes, restaurant switching, cancellation, expired approval, rate limits, auth expiry, external cart edits and cleanup failures. No orders or payments are exposed.
4. Save a sanitized validation record. Only then enable live quotes. Complete the staging duration and review required by Swiggy before requesting production.

OAuth metadata may advertise refresh-token support while the [auth guide](https://mcp.swiggy.com/builders/docs/start/authenticate/) says issuance is not wired. This prototype reconnects when the access token expires. Confirm current behaviour in staging.

Follow [Swiggy data handling requirements](https://mcp.swiggy.com/builders/docs/operate/data-and-compliance/), especially the requirements for sending account/menu/cart context to an LLM outside India. This is an approval/compliance item before production; implementation does not establish approval. The app minimizes address information passed to the agent and does not retain a deal corpus.
