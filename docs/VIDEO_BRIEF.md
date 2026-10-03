# MealMint video brief for Sol 6.1

2026-10-03. The user requests a polished MacBook-style product walkthrough: large pointer, text callouts and smooth motion. The subsequent instruction is to audit the app and prepare this brief for Sol 6.1 before rendering. The finished MP4 is now published; see `VIDEO_DELIVERY.md`. The storyboard below preserves the original brief.

## Creative direction

Use a clean Mac-style browser window, rounded corners, subtle shadow and small traffic-light controls on a warm cream/sage background. Keep MealMint's orange/green identity. This should feel like a restrained product demonstration, with readable UI and one message at a time. No spinning 3D laptop, frantic camera movements or generic stock footage.

Master: 1920 × 1080, 30 fps, approximately 55–60 seconds. Deliver H.264 MP4, yuv420p, faststart, and a small web poster. Playback must work without sound; no voiceover is needed by default. Use concise, large captions and ample contrast. Optional sound can be added later, using licensed/original audio only.

Use a 36–44 px arrow pointer with a dark outline and soft shadow. Move it with eased paths to actual controls, pause before clicking and add a subtle 250–350 ms click ring. Two or three controlled zooms (roughly 1.15–1.25×) can focus on chat, the approval plan and the final price. Don't obscure the relevant UI with captions or the pointer. Avoid bouncing cursor motion.

## Storyboard

| Time | Actual product action | Overlay text | Pointer/camera |
| --- | --- | --- | --- |
| 0–4 s | Short brand intro, then full app | Good food. A smaller bill. | Gentle window reveal |
| 4–10 s | Select synthetic Home address; enter a vegetarian lunch request under ₹250 | Start with your budget and preferences | Move to location, then composer; no token screen |
| 10–18 s | Agent searches, remembers the requested preference and proposes exact same-restaurant bundle | One conversation. Useful combinations. | Focus chat; condense waiting with a clear edit |
| 18–25 s | Shortlist contains one veg thali + one dal-rice bowl; ₹218 listed subtotal | Listed prices are only the starting point | Move to bundle; hold readable subtotal/fee caveat |
| 25–33 s | Select bundle → Check totals → exact approval plan → Approve | You approve the exact cart check | Focus consent; don't skip or imply automatic consent |
| 33–43 s | Result shows ₹217.30 payable: items 218, delivery 24, charges 18.90, SAVE20 −43.60 | Compare what you'll actually pay | Focus price/components; show lowest among checked options |
| 43–51 s | Settings shows agent-saved vegetarian preference and its source | Preferences that carry into your next chat | Large pointer to saved directive; demonstrate review |
| 51–58 s | Closing brand card, domain and source link | MealMint · Web chat + Telegram adapter | Full window, restrained end fade |

A natural demo prompt: “Remember that I prefer vegetarian lunches. Show one Veg thali and one Dal rice bowl from Everyday Kitchen together as one bundle under ₹250 delivered. Do not change the cart yet.” This is fictional QA input, not the owner's actual preference. Remove it from the live directive store after filming.

## Truthfulness and privacy

Keep “Synthetic Swiggy data” visible throughout the application scenes. Actual Codex Luna max inference is allowed and has been requested for agent testing; all food/menu/cart data shown must be synthetic. The ₹217.30 figure is the mock-gateway result, not a live Swiggy offer. Never claim exhaustive global optimization, real Swiggy OAuth success, order placement or payment.

The Telegram adapter is implemented, but a dedicated bot token is still missing. Don't portray a live Telegram exchange until pairing and real chat pass. Use “Telegram adapter” in the closing text for now, or omit it from the video. Web alone is sufficient to demonstrate the existing prototype honestly.

Do not film or include app access tokens, Codex credentials, DNS keys, phone/OTP, real addresses, legal form details, terminal history or unrelated browser tabs. Begin after owner sign-in. Hide no synthetic-data notices. Any edited waiting should be labelled/obvious; don't pass off still-frame animation as uninterrupted screen recording.

## Implementation plan

1. Read `DEPLOYMENT_AUDIT.md`, `project-memory/CURRENT_STATE.md` and `NEXT_CHECKPOINT.md`. Verify hosted tool use before filming. Do not repeat the fixed incomplete-Codex-runtime installation.
2. Capture a fresh successful hosted flow through the approved browser tools. Save safe screenshots/frames under ignored `.local/hosting/mealmint-demo/`. Get actual visible control positions for pointer paths. Capture the full app first, then editorial crops. Avoid secrets/transcripts in Git.
3. Build an edited motion walkthrough from these real UI captures. A local FFmpeg/Python frame-composition pipeline is suitable: Mac window/background, rounded mask, captions, pointer paths/click rings, restrained zooms and transitions. Preserve a reproducible renderer plus scene timing/coordinate manifest in the repo. Rendering happens locally, never on the 1 GB VM.
4. Validate MP4 using ffprobe, inspect representative frames at every scene/cut, play the video, check caption duration/contrast, pointer targets, aspect ratio and synthetic labels. Verify the final clip has no credentials or real account data.
5. Publish only reviewed synthetic assets to `/srv/mealmint-public/demo/`. A draft page exists at `deploy/public-demo/index.html`; it references `/demo/mealmint-demo.mp4` and `/demo/05-result.png`. This original draft was subsequently deployed with the verified video; see the delivery record. Add a Caddy `/demo/*` static route only after those files exist; preserve the app proxy and existing resume site. Redirect `/demo` to `/demo/`.
6. Check anonymous HTTPS access to both `/demo/` and `/demo/mealmint-demo.mp4`, including video range requests and mobile playback. Provide a local downloadable file and public direct video URL. If the Google form rejects a self-hosted video, the user can upload that MP4 to Loom/YouTube/Drive with public viewing.
7. Update `APPLICATION_PACKET.md` with the actual verified demo link, update durable project memory and push the renderer/brief/evidence records. Keep screenshots, video binaries, credentials and runtime data outside Git.

## Original captures and completion

The original `.local/hosting/mealmint-demo/01-start.png` and `02-request.png` are preparatory captures taken before the missing Codex companion was repaired. Do not treat them as a successful flow. The later hosted walkthrough passed; 03-shortlist.png, 04-approval.png, 05-result.png and 06-directives.png are successful safe captures. The completed video uses fresh captures taken after refining the pre-cart coupon wording; the earlier evidence remains historical. These demo filenames have since been refreshed for the final video. Existing `.local/screenshots/web-bundle.jpg` shows an earlier successful local flow; it isn't proof of remote deployment.
