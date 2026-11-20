# Supabase setup

1. Create a Supabase project.
2. Open SQL Editor and apply `migrations/001_initial_schema.sql`.
3. Create an Auth user for each volunteer and link `auth_user_id` to the corresponding `volunteers` row.
4. Configure password recovery email delivery using a custom SMTP provider before inviting real volunteers.
5. Do not disable RLS. Add and test role-aware policies before exposing any data.

The schema intentionally enables RLS but does not yet add permissive policies. The app is not production-ready until the policies and secure identifier-login Edge Function are implemented and tested.