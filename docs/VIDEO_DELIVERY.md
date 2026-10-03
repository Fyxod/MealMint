# MealMint video delivery

2026-10-03. The deliverable is a 58-second, 1920×1080, 30 fps H.264 MP4
with a Mac-style browser frame, eased large pointer, click rings, gentle zooms
and captions. It has no audio and works as a silent product walkthrough.

This is an edited motion walkthrough of actual hosted UI captures; waits are
condensed. The Codex agent really ran `gpt-6-luna` at `max` effort. All restaurant,
menu, address and price data is synthetic. The film shows budget/preference
input, exact same-restaurant bundle, user approval, SAVE20 price comparison and
saved preference review. Telegram is described only as an adapter.

The coupon source change originally in release `4a9d4ff` explains that a coupon's current-cart
eligibility can differ from a proposed bundle. Typecheck, 73 tests and production
build passed before deployment. A fresh hosted agent flow returned the expected
₹218 listed subtotal and ₹217.30 verified mock payable total after approval. The
fictional filming preference was removed and the workspace reset.

Reproducible renderer and scene manifest: `scripts/video/`. Private captures
and final media stay in ignored `.local/hosting/`; none of them is committed.
See that renderer's README for build and privacy instructions. Render locally,
never on the 1 GB VM.

## Verified publication

- Watch: https://mealmint.parthkatiyar.xyz/demo/
- Direct video: https://mealmint.parthkatiyar.xyz/demo/mealmint-demo.mp4
- Callback for the application: https://mealmint.parthkatiyar.xyz/auth/swiggy/callback
- Local file: `.local/hosting/video/mealmint-demo.mp4`, 3,180,440 bytes.
- SHA-256: `ad8d0c076113a8450618657f3c0aaceac81e926cb49fec19451715fe8dcef630`.

FFprobe confirmed H.264, yuv420p, 1920×1080, 30 fps, exactly 1,740 frames and
58 seconds. FFmpeg decoded the entire file with no errors. The `moov` atom
precedes media data for faststart. The contact sheet and final result frame were
visually checked; a pointer/price overlap was corrected before publication.

Anonymous HTTPS returned 200 for page, poster and MP4; a byte-range request
returned 206 with `video/mp4` and the expected range. Downloaded public bytes
matched the local hash. Browser controls started playback; media time advanced
through 36 and 54 seconds and finished at 58 seconds, with duration 58, decoded 1920×1080 and no media
error. At 390 CSS pixels the video fitted the page and no horizontal overflow
occurred; playback continued. The viewport override was reset.

Caddy configuration validated and reloaded. MealMint, Caddy and resume services
remained active; health and resume returned 200, private unsigned API returned
401. Public files are isolated in `/srv/mealmint-public/demo/`. Local proof
screenshots: `.local/hosting/video/public-demo.png` and `public-demo-mobile.png`.

Remaining external steps are a dedicated Telegram bot token, approved Swiggy
access/staging checks, and the owner's legal/contact form submission. Codex
authentication works now; no user interaction was required. Latest VM short
sample after migration showed ~352 MiB service peak, ~22 MiB service swap and 370 MiB available RAM.
No upgrade is indicated by this sample; routine-use capacity remains unmeasured.

## MealMint rename

Source release `5078ba4` renamed the app, client identities, service/user and hosting paths. Fresh hosted Luna max captures were made on https://mealmint.parthkatiyar.xyz/ and the complete video was rendered again with MealMint branding, an M intro icon, new domain and new GitHub link. The hash/size above identify this rebranded version. Previous media are private historical artifacts; the old public MP4 was removed and its old-domain link redirects to the new one.

Rebranded video playback finished at 58 seconds with no media error. Public page title/body contained MealMint and no previous product branding. New proof screenshots: `.local/hosting/mealmint-app.png` and `.local/hosting/mealmint-public-demo.png`.
