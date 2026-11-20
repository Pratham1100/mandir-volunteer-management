-- Initial schema for Shri Laxmi Narayan Mandir Volunteer Management.
-- Apply through Supabase SQL Editor after reviewing. Do not expose service-role keys in the browser.

create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin', 'management', 'duty_head', 'volunteer');
create type public.registration_kind as enum ('advance', 'onsite');
create type public.payment_mode as enum ('cash', 'online_qr');
create type public.payment_status as enum ('pending', 'verified', 'rejected');
create type public.attendance_status as enum ('present', 'late', 'absent');

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  volunteer_code text not null unique,
  full_name text not null,
  mobile text not null unique,
  email text not null unique,
  role public.app_role not null default 'volunteer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  registration_fee numeric(10,2) not null default 0 check (registration_fee >= 0),
  family_fee numeric(10,2) check (family_fee is null or family_fee >= 0),
  is_active boolean not null default false,
  created_by uuid references public.volunteers(id),
  created_at timestamptz not null default now()
);

create unique index one_active_event_idx on public.events (is_active) where is_active = true;

create table public.duties (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  description text,
  reporting_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.duty_assignments (
  id uuid primary key default gen_random_uuid(),
  duty_id uuid not null references public.duties(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  assignment_type text not null check (assignment_type in ('head', 'associate')),
  created_at timestamptz not null default now(),
  unique (duty_id, volunteer_id)
);

create unique index one_head_per_duty_idx on public.duty_assignments(duty_id)
where assignment_type = 'head';

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  registration_number text not null unique,
  event_id uuid not null references public.events(id),
  registered_by uuid references public.volunteers(id),
  registration_kind public.registration_kind not null,
  registrant_name text not null,
  mobile text not null,
  is_family boolean not null default false,
  amount_due numeric(10,2) not null default 0 check (amount_due >= 0),
  payment_mode public.payment_mode not null,
  payment_status public.payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index registrations_event_created_idx on public.registrations(event_id, created_at desc);
create index registrations_mobile_idx on public.registrations(mobile);

create table public.registration_members (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  duty_id uuid not null references public.duties(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  marked_by uuid references public.volunteers(id),
  status public.attendance_status not null,
  marked_at timestamptz not null default now(),
  unique (duty_id, volunteer_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  audience text not null default 'all' check (audience in ('all', 'management', 'duty_team', 'individual')),
  target_volunteer_id uuid references public.volunteers(id),
  published_at timestamptz not null default now(),
  created_by uuid references public.volunteers(id)
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  is_completed boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  storage_path text not null,
  uploaded_by uuid references public.volunteers(id),
  created_at timestamptz not null default now()
);

-- Enable RLS immediately. Policies are added in the next security milestone.
alter table public.volunteers enable row level security;
alter table public.events enable row level security;
alter table public.duties enable row level security;
alter table public.duty_assignments enable row level security;
alter table public.registrations enable row level security;
alter table public.registration_members enable row level security;
alter table public.attendance enable row level security;
alter table public.announcements enable row level security;
alter table public.checklist_items enable row level security;
alter table public.documents enable row level security;