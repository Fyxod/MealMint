# Next checkpoint

Current phase: deployed personal prototype and finished public video. Read repository `docs/VIDEO_DELIVERY.md`, `docs/DEPLOYMENT_AUDIT.md` and `docs/APPLICATION_PACKET.md`. Source renderer/manifest are in `scripts/video/`; synthetic captures and media are ignored under `.local/hosting/`.

Verified public watch page: https://foodfinder.parthkatiyar.xyz/demo/; direct video: https://foodfinder.parthkatiyar.xyz/demo/foodfinder-demo.mp4. It is an edited 58-second 1080p/30fps walkthrough of actual Luna max with synthetic food data, explicit approval and saved directive review. Anonymous HTTPS/range/hash, full media decode, browser playback and responsive checks passed; API remains private and resume stayed working. Owner app token is private under `.local/hosting/app-access-token`, never output it.

Current runtime release: 4a9d4ff at `/opt/foodfinder/current` on the supplied VM. Full Codex runtime including companion required. Typecheck, 73 tests, build, audit and fresh hosted Luna max exact bundle/₹217.30 mock comparison passed. Filming directive removed. Builds/renders stay off the VM; latest short sample had ~329 MiB service peak, zero service swap and 384 MiB available RAM. No upgrade/auth action needed now; routine use capacity remains unmeasured.

Next external steps: owner fills contact/legal Google form and acknowledges terms; obtain dedicated Telegram bot token then validate real pairing/private chat; obtain Swiggy reviewed access/agreement and staging schema/unit/cart evidence before enabling live writes. No form response submitted. Remote future Codex re-auth uses service-owner device login or forwarded localhost callback; direct hosted login button is not verified as a remote re-auth flow. Do not fabricate live Swiggy/Telegram success.
