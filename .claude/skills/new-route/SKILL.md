---
name: new-route
description: Create a new FastAPI backend route for VocaFlow. Use when building any new API endpoint.
---

Create a new FastAPI route following VocaFlow standards:

1. Create a new router file in /backend/routers/
2. Use async route handlers always
3. Add Pydantic models for request and response
4. Wrap all Supabase calls in try/except
5. Register the router in /backend/main.py automatically

Critical rules:
- Never call Groq or any LLM inside a route that handles active sessions
- All env vars via os.getenv(), never hardcoded
- Return consistent error response format: {error: string, code: int}