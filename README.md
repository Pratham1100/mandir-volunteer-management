# Mandir Volunteer Management

Initial foundation for Shri Laxmi Narayan Mandir, Model House, Jalandhar.

## Stack
- React + Vite
- Tailwind CSS
- Supabase Auth + PostgreSQL + Storage
- Vercel hosting (planned)

## Run locally
1. Install Node.js LTS.
2. Extract this folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and add the Supabase project URL and anon key.
5. Run `npm run dev`.

## Important status
This is the first foundation milestone, not a production-ready app. The login UI is a design shell. Identifier login (Volunteer ID/mobile/email + one password) must be implemented through a secure Supabase Edge Function that resolves the identifier to the account email and then authenticates with Supabase Auth. Never expose the Supabase service-role key in frontend code.

Before real use, implement and test:
- identifier resolution and password recovery
- row-level security policies for all tables
- management-only write permissions
- transactional registration number generation and payment verification
- audit logging, backups, rate limiting and load testing
- storage access policies and deployment configuration

Every user-facing label should remain English followed by Hindi in parentheses.