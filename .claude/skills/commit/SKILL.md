---
name: commit
description: Create a git commit with a proper message. Use after completing any feature or fix.
---

Create a git commit following conventional commits format:

1. Run git diff --staged to see what's changing
2. Write commit message in format: type(scope): description
   - Types: feat, fix, chore, refactor, test, docs
   - Example: feat(webrtc): add call screen component
3. Keep subject line under 72 characters
4. Stage all relevant files before committing
5. Never commit .env files or API keys