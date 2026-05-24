---
name: db-migration
description: Generate a Supabase SQL migration for a schema change. Use when adding tables, columns, or indexes.
---

Generate a Supabase SQL migration:

1. Create file in /backend/migrations/ with format: YYYYMMDD_description.sql
2. Always include both UP migration and DOWN (rollback) migration
3. Never modify existing migration files
4. Add a comment at the top explaining what this migration does

Tables in this project:
- users, schedules, session_logs, daily_summaries, weekly_summaries