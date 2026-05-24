---
name: review
description: Review code before committing. Checks for security issues, missing error handling, and VocaFlow-specific rules.
---

Review all changed files and check for:

1. Security — any hardcoded API keys, secrets, or tokens
2. Architecture — any LLM/Groq calls inside session-handling code (not allowed)
3. Error handling — every Supabase query and WebRTC event has try/catch
4. Console.logs — remove any left in production code
5. Missing .env usage — any hardcoded URLs or credentials

Report findings as:
- 🔴 Critical (must fix before commit)
- 🟡 Warning (should fix)
- 🟢 Good (noting what's done well)