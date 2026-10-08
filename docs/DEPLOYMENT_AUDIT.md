> October 8 update: Swiggy and paired Telegram are live; controlled results and current limitations are in [LIVE_VALIDATION.md](LIVE_VALIDATION.md). The dated October 3 audit below preserves the earlier synthetic milestone.

# Deployment audit — 2026-10-03

## Current conclusion

The hosted personal prototype at https://mealmint.parthkatiyar.xyz/ works with real Codex gpt-6-luna/max and synthetic Swiggy data. It is not a fully validated real-Swiggy or Telegram integration. The finished edited video is documented in `VIDEO_DELIVERY.md`; the original creative brief is preserved in `VIDEO_BRIEF.md`.

## Checks and evidence

| Area | Result / limit |
| --- | --- |
| DNS | Target A record points to the supplied VM, TTL 600; GoDaddy readback and external resolution passed. Other records preserved. |
| HTTPS | Caddy issued a valid certificate; external HTTPS health returned 200. HTTP redirects to HTTPS. |
| Existing site | Resume site returned 200 after the Caddy changes; its service remained active. |
| App access | Random owner token required; unsigned API request returned 401. Browser sign-in and secure session flow passed. Token values stayed out of tool output/Git. |
| OAuth endpoint | Exact public callback reached its handler and returned 400 without valid state. This is route/security evidence, not a successful Swiggy authorization. |
| Codex runtime | CLI 0.160.0 plus its matching code-mode companion; existing protected VM ChatGPT session reused. No interactive sign-in was needed. |
| Actual LLM tool loop | Repaired runtime diagnostic passed with context/preferences/search/present calls and two dosa candidates, veg/₹120. Hosted browser also passed remembering and exact item bundle. |
| Cart flow | Hosted exact thali + dal-rice bundle at listed ₹218, explicit plan approval, verified mock ₹217.30 with SAVE20. Subsequent comparison prompt showed an empty existing cart; new prompt cancelled without writes. |
| Durable directives | Agent-saved fictional vegetarian-lunch directive appeared with user source, survived systemd restart and was then deleted. No test preference left as an owner's real preference. |
| Restart | Service restarted normally; encrypted runtime store persisted and browser could sign in again. In-memory chat/cookies reset as designed. |
| Automated checks | 73 tests/nine files, typecheck, dependency audit (zero known vulnerabilities), strict memory validation passed. Earlier public CI remains linked in `VALIDATION.md`. |
| Capacity | After one real hosted chat/comparison: cgroup current 298,745,856 bytes, peak 342,274,048 bytes (about 285/326 MiB), service swap 6,123,520 bytes; OS available about 375 MiB. Three interval vmstat samples showed zero ongoing swap-in/out. Short check only, no load/peak guarantee. |

Safe screenshot evidence is local-only: `.local/hosting/mealmint-demo/03-shortlist.png`, `04-approval.png`, `05-result.png`, `06-directives.png`. Preparatory `01-start.png`/`02-request.png` precede the runtime repair and must not be presented as a successful end-to-end flow. Re-capture for the polished video.

## Repairs and valid negative results

The initial remote Node probe ran while its binary transfer was incomplete and exited with a segmentation fault. That probe was invalid for app compatibility; after transfer completed, Node and release SHA-256 matched local files and Node 24.19.0 ran correctly. Always await transfers and verify hashes before probing/installing.

Caddy's existing ACME directories were owned by root, preventing challenge-token creation. Corrected ownership of its ACME tree and certificate parent to caddy; the automatic retry issued HTTPS successfully. Existing resume certificate/site remained working.

The first hosted LLM reply couldn't use food tools although authentication worked. A diagnostic recorded zero tool calls and missing-code-mode-host stderr indicators. Installing the matching `codex-code-mode-host` companion beside Codex fixed the tool loop. Preserve the complete Codex release/runtime on future deployments; `codex --version` and account status alone do not establish inference/tool readiness.

## Runtime and operations

- Current release: `/opt/mealmint/releases/5078ba4` (original deployment 7968d8e); `/opt/mealmint/current` is its absolute symlink.
- Node/Codex/companion: `/opt/mealmint/runtime/bin/`.
- Service: `mealmint.service`, dedicated unprivileged owner, strict read-only system/home except its Codex directory and runtime state; localhost port 3000 behind Caddy. Public app token in protected `/etc/mealmint/mealmint.env` (0600).
- Runtime state: `/var/lib/mealmint`, linked as release `.local`; Swiggy tokens/directives encrypted, Codex CLI credentials in a protected owner-only file under `/home/mealmint/.codex`.
- Added 2 GiB swap at `/swapfile-mealmint`, persistent fstab entry and swappiness 10. Service memory high/max 350/500 MiB, swap cap 1 GiB. No existing service stopped permanently, no VM reboot or unrelated OS upgrade.
- Local owner access token is saved under ignored `.local/hosting/app-access-token` (0600). Read it privately; do not paste into public docs or a demo. Rotate it through the VM environment if needed.
- Safe deployed unit/Caddy templates are in `deploy/mealmint.service` and `deploy/mealmint.caddy`. DNS and prior Caddy configuration backups remain private on the VM.
- For rollback, stop MealMint and remove only its Caddy include/reload. Preserve the existing main Caddy configuration/resume service. Future app releases should retain state/env, atomically replace `current`, restart, and pass authenticated Luna max and HTTPS/browser checks.

## Outstanding items for Sol / the owner

1. Produce the requested edited Mac-style video following `VIDEO_BRIEF.md`. No MP4 or public `/demo/` route has been created. The static demo HTML is a draft, not a live link.
2. Tighten coupon wording before the final recording: a pre-cart contextual coupon check can report inapplicability for the current empty cart. The hosted agent described visible offers as inapplicable, while the approved bundle later qualified for SAVE20. Update the prompt/tool note to distinguish current-cart eligibility from a proposed bundle; do not discard useful threshold hypotheses prematurely. Backend pricing/coupon checks were correct.
3. A dedicated Telegram bot token was not found in the credential inventory. Adapter unit tests pass; real pairing/private chat remain unverified. Do not reuse unrelated third-party credentials or show a fabricated Telegram conversation.
4. Real Swiggy OAuth/MCP schema/price-unit/coupon/cart validation awaits access. Live writes remain disabled. Coordinate production data-processing requirements with Swiggy before passing real account context to the LLM.
5. The hosted Connect Codex button uses CLI's localhost callback flow. Current session works and refresh is CLI-managed; future interactive VM re-authentication should use a supported device-code login as the service owner or an SSH-forwarded callback. A direct browser localhost link from the hosted app is not verified as a remote re-auth flow. Handle/communicate this clearly before offering multi-user sign-in.
6. Continue measuring the whole VM under routine use. Current samples support one owner on 1 GB with swap/off-VM builds. Upgrade RAM if available headroom routinely drops below roughly 200 MiB, sustained swapping appears, or OOMs occur. Do not render video/build on this VM.

## Video completion update — 2026-10-03

Current-cart coupon applicability wording was clarified in the prompt/tool note and deployed as `4a9d4ff`. All 73 tests, typecheck, build and dependency audit passed. Fresh hosted Luna max flow proposed the exact ₹218 bundle; approved comparison returned ₹217.30 with SAVE20, and the fictional preference was removed. Safe captures were refreshed for the final edited video.

The public `/demo/` static route now serves only reviewed synthetic video, poster and explanatory HTML; the app API remains owner-protected. Full video decode and anonymous HTTPS/range checks passed. See `VIDEO_DELIVERY.md` for playback/publication evidence. Resume stayed 200. Latest post-chat service peak was 345,317,376 bytes (~329 MiB), service swap 0, VM available memory 384 MiB; this is still a short single-owner sample. No interactive Codex authentication or RAM upgrade was needed. Original outstanding items 1–2 above are completed; Telegram token, approved Swiggy access and future remote re-auth remain external/maintenance gates.

## MealMint rename and migration — 2026-10-03

The user requested MealMint everywhere. Repo is now Fyxod/MealMint and local checkout /home/fyxod/Desktop/MealMint. Domain is mealmint.parthkatiyar.xyz; current source runtime 5078ba4. Dedicated service/user, HOME, state/env/runtime/static directories and swap file were renamed to mealmint while retaining UID/GID, auth, encryption keys and runtime companions. The old active paths/unit were removed. Only the target DNS record was added, leaving other records intact. HTTPS and authenticated browser sign-in passed, actual Luna max proposed/remembered and approved the exact bundle for ₹217.30, and the fictional directive was removed. Private API remains 401 unsigned, callback without state 400, resume 200. No new authentication needed.

The old domain redirects 308, including its former video filename; new public video/page use MealMint exclusively. Deployment tar hashes matched. Latest short sample after fresh chat: current 337,170,432 bytes, peak 368,947,200 bytes (~352 MiB), service swap 23,527,424 bytes, OS available 370 MiB. No crash/restart observed. This remains a short capacity sample. Old names in the history/legacy redirect and protected rollback backups are historical provenance, not active services.
