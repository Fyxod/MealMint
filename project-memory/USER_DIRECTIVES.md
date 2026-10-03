# User directives

2026-10-03: Build an LLM-driven assistant to find cheap food and account offers through official Swiggy MCP. Users provide budget and preferences conversationally. Both web and Telegram are required; WhatsApp is later. Codex sign-in powers the LLM first; more provider authentication methods later.

Personal account first; compare any inexpensive food with opt-in shortlist cart changes, without placing orders. Create and push the public GitHub repo `Fyxod/swiggy-mcp`.

User specifies `/home/fyxod/Desktop/swiggy-mcp`, durable-project-memory skill, and Luna max for all tests. Azure VM access will be supplied later; proposed capacity 1 GB RAM / 2 vCPU needs measured validation. Notify user only when their participation in Codex authentication is actually needed.

Clarification 2026-10-03: Luna max is the actual agent LLM for Codex-auth and Swiggy MCP testing, rather than a requirement to delegate all checks. Subagents are allowed if useful. Report if VM memory needs increasing and whether swap is insufficient.

2026-10-03 additions: Root should create the product; Luna may verify it. The system prompt must seek item/quantity/coupon combinations that minimize the qualifying delivered cart total. Save useful stable user directives when the LLM judges them useful or the user explicitly requests remembering; share runtime preferences across web and Telegram with review/delete controls. This runtime directive store is separate from project memory.
