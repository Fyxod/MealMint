# Project instructions

Read project-memory/README.md, USER_DIRECTIVES.md, CURRENT_STATE.md and NEXT_CHECKPOINT.md before working. The workspace and verified evidence override stale memory. Update project memory at meaningful milestones and preserve dated decision history.

Use /home/fyxod/Desktop/swiggy-mcp as the authoritative checkout. Public GitHub publication is authorized. Keep credentials, account data, transcripts and runtime state out of Git. Synthetic fixtures must be labelled.

The user clarified that Luna max means the application's actual LLM for Codex-auth and Swiggy MCP agent tests: set CODEX_MODEL=gpt-6-luna and CODEX_EFFORT=max. Test subagents are optional and authorized. Do not mark tests passed without actual results.

Implement both web chat and Telegram, sharing the same Codex provider and Swiggy account. No order or payment tool may be exposed. Cart comparisons require exact user approval. Hosting is authorized on the Azure VM reached by droplet2 at foodfinder.parthkatiyar.xyz. Preserve the existing resume service. Do not deploy elsewhere.
