# Reading Quest Supabase Setup

This folder contains the database foundation for moving Reading Quest from browser-only beta storage to cross-device accounts.

## First Setup

1. Open Supabase SQL Editor.
2. Run `supabase/migrations/001_initial_reading_quest_schema.sql`.
3. In Vercel, add these environment variables for Production and Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not expose it to browser code.

## What This Adds

- Profiles for parents and children.
- Parent-child links and verification requests.
- Quiz results, issue reports, reviews, reading logs, prizes, prize requests, friends, challenges, feedback, and telemetry.
- Row Level Security policies for authenticated family access.
- `beta_local_id` on profiles so browser-local beta accounts can be linked or migrated during the bridge phase.

## Next Pushes

1. Real Supabase Auth for parent accounts.
2. Child profile selection and child PIN/password bridge under parent accounts.
3. Local beta data migration into Supabase.
4. Admin reads from Supabase instead of only local browser storage.
