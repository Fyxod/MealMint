# Current state

2026-10-03: Implementation started from an empty target directory. Git initialized on main. Codex CLI 0.160.0 is installed and reports ChatGPT login. Node 24.19.0 is available through the bundled desktop runtime; system Node 18 is too old.

Shared backend, web chat, Telegram adapter, Codex provider, mock/live food gateways and Swiggy OAuth are implemented. Public repository: https://github.com/Fyxod/swiggy-mcp. Bootstrap commit 78bc815 is the previous public checkpoint; the implementation containing this record is ready for commit/push. Verify local/remote Git state before resuming.

Typecheck, production build and all 73 tests across nine files pass. Full npm audit reported zero known vulnerabilities. A real authenticated Codex gpt-6-luna/max food-tool loop passed against synthetic food data; the production-browser shortlist/approval/total flow passed, including exact bundles, coupon totals, directive Settings controls, final UI polish and a phone-width overflow check. Root wrote product code; Luna only verified tests. Evidence: repository paths `package.json`, `tests/`, `scripts/smoke-codex.ts`, `scripts/smoke-codex-advanced.ts`, `docs/VALIDATION.md` and [Sources](SOURCES.md). Strict memory validation passed.

Root implemented item/coupon combination tools and encrypted shared user directives; the system prompt includes cheapest qualifying cart optimization. Actual Luna max advanced smoke saved a synthetic user directive and proposed an exact two-item bundle without approval/cart writes. Earlier 59-test milestone remains historical in the decision log; final verification supersedes it.

Measured local Node/Codex/helpers after a chat: about 269 MiB total RSS, not a peak/VM benchmark. 1 GB / 2 vCPU is a reasonable personal-prototype starting point with off-VM builds; measure Azure OS/proxy headroom before confirming. Sustained swap or OOM means upgrade RAM.

Hosting, Telegram bot credentials and Swiggy staging/production access are pending. No live Swiggy, real Telegram message or Azure validation is claimed. Existing local Codex ChatGPT sign-in worked, so no user auth action was needed. Preview can run on localhost:3000 from compiled output; inspect the actual listener/process before assuming it remains alive.
