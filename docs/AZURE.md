# Azure deployment preparation

No VM has been accessed or deployed yet. Use one Node process serving the compiled web app and API, one Codex app-server child, Telegram long polling and a Caddy TLS reverse proxy. A database, Docker and a separate OAuth relay are unnecessary for the personal prototype.

The model runs remotely; Luna max does not consume local model-weight memory. The local Node/Codex/helper process tree used about 269 MiB RSS after a chat and comparison; the short run does not measure peak load. See [measured validation](VALIDATION.md). A 1 GB / 2 vCPU VM is a reasonable starting point for one owner, not a confirmed capacity guarantee. Build on the developer machine or CI and transfer compiled files plus production dependencies. Avoid Vite/watch processes and concurrent builds on the small VM.

Once access is supplied, measure the systemd service's complete process tree during repeated chats and comparisons, plus OS/proxy usage. Keep headroom for spikes. If the service/OS cannot leave about 200 MB available, the kernel kills processes, or routine chat causes sustained swapping, upgrade to 2 GB rather than relying on swap. A modest swap file can absorb brief spikes; it does not replace active RAM. No swap changes have been made here.

## Layout and environment

Suggested layout: `/opt/swiggy-mcp` owned by a dedicated `swiggy` service user, `.env` mode 0600, `.local` mode 0700, Node 24+ and Codex CLI on the service PATH. Copy the templates in `deploy/` only after replacing placeholders and verifying paths.

```dotenv
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://YOUR_DOMAIN
APP_ACCESS_TOKEN=YOUR_RANDOM_SECRET_AT_LEAST_24_CHARACTERS
CODEX_BIN=/usr/local/bin/codex
CODEX_MODEL=gpt-6-luna
CODEX_EFFORT=max
SWIGGY_MODE=mock
SWIGGY_REDIRECT_URI=https://YOUR_DOMAIN/auth/swiggy/callback
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
```

Generate the actual access token privately, never commit it. Configure DNS, TLS and Azure inbound rules for HTTPS and restricted SSH; do not expose port 3000 publicly. The server requires an access token whenever `APP_ORIGIN` is HTTPS, even if bound to localhost. Caddy forwards SSE without buffering; this app does not enable access logging of OAuth query strings.

## Codex authentication on the VM

The local prototype reuses the installed Codex CLI's ChatGPT session. VM auth must run as the service user, using the supported flow for the installed CLI and account. A browser's localhost callback reaches the browser machine. Confirm the current [self-hosted VM sign-in guidance](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms) and tool registration/session format when deploying; preserve VM identity, transfer only the documented protected credentials securely if that flow is required, and let the VM own refreshes. Never paste auth-file contents into chat or Git. We will notify the user when an interactive sign-in is actually needed.

## Deployment gate

Verify `GET /health`, HTTPS web sign-in, streamed Codex Luna max chat, Telegram pairing and restart recovery. Start with synthetic Swiggy mode. Confirm the callback is reachable and exact before using it in the Swiggy application. Do not enable live cart writes until the separate staging gate passes. No hosted success is claimed from local tests.
