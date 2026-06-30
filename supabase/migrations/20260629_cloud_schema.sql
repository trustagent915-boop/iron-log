create extension if not exists pgcrypto;

create or replace function public.set_arm_tracker_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.arm_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.arm_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_file_name text,
  status text not null check (status in ('active', 'archived')),
  imported_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.arm_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.arm_plans(id) on delete cascade,
  session_date date not null,
  day_label text,
  week_number integer,
  notes text,
  status text not null check (status in ('planned', 'completed', 'partial', 'skipped')),
  kind text not null check (kind in ('planned', 'custom')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.arm_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.arm_sessions(id) on delete cascade,
  exercise_name text not null,
  planned_sets numeric,
  planned_reps numeric,
  planned_weight numeric,
  planned_notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.arm_workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_session_id uuid not null references public.arm_sessions(id) on delete cascade,
  performed_date date not null,
  bodyweight_kg numeric,
  overall_notes text,
  completion_status text not null check (completion_status in ('completed', 'partial', 'skipped')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, plan_session_id)
);

create table if not exists public.arm_workout_exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_log_id uuid not null references public.arm_workout_logs(id) on delete cascade,
  plan_exercise_id uuid not null references public.arm_plan_exercises(id) on delete restrict,
  exercise_name_snapshot text not null,
  planned_sets_snapshot numeric,
  planned_reps_snapshot numeric,
  planned_weight_snapshot numeric,
  planned_notes_snapshot text,
  actual_weight numeric,
  actual_reps numeric,
  actual_sets numeric,
  notes text,
  performed_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.arm_level100_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, exercise_name)
);

create table if not exists public.arm_level100_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  bodyweight_kg numeric,
  weight numeric,
  reps numeric,
  seconds numeric,
  record_date date not null,
  source_workout_exercise_log_id uuid references public.arm_workout_exercise_logs(id) on delete set null,
  is_manual boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.arm_import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  sheet_name text not null,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.arm_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.arm_tracker_snapshot_versions (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  snapshot jsonb not null,
  seed_version text,
  source text not null default 'api',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists arm_plans_user_status_idx on public.arm_plans(user_id, status);
create index if not exists arm_sessions_user_date_idx on public.arm_sessions(user_id, session_date desc);
create index if not exists arm_plan_exercises_session_idx on public.arm_plan_exercises(session_id, sort_order);
create index if not exists arm_workout_logs_user_date_idx on public.arm_workout_logs(user_id, performed_date desc);
create index if not exists arm_workout_exercise_logs_workout_idx on public.arm_workout_exercise_logs(workout_log_id, performed_order);
create index if not exists arm_level100_records_user_exercise_idx on public.arm_level100_records(user_id, exercise_name, record_date desc);
create index if not exists arm_audit_events_user_created_idx on public.arm_audit_events(user_id, created_at desc);
create index if not exists arm_tracker_snapshot_versions_owner_created_idx
on public.arm_tracker_snapshot_versions(owner_key, created_at desc);

alter table public.arm_profiles enable row level security;
alter table public.arm_plans enable row level security;
alter table public.arm_sessions enable row level security;
alter table public.arm_plan_exercises enable row level security;
alter table public.arm_workout_logs enable row level security;
alter table public.arm_workout_exercise_logs enable row level security;
alter table public.arm_level100_watchlist enable row level security;
alter table public.arm_level100_records enable row level security;
alter table public.arm_import_runs enable row level security;
alter table public.arm_audit_events enable row level security;
alter table public.arm_tracker_snapshot_versions enable row level security;

drop policy if exists "users manage own profiles" on public.arm_profiles;
create policy "users manage own profiles" on public.arm_profiles
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own plans" on public.arm_plans;
create policy "users manage own plans" on public.arm_plans
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own sessions" on public.arm_sessions;
create policy "users manage own sessions" on public.arm_sessions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own plan exercises" on public.arm_plan_exercises;
create policy "users manage own plan exercises" on public.arm_plan_exercises
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own workout logs" on public.arm_workout_logs;
create policy "users manage own workout logs" on public.arm_workout_logs
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own workout exercise logs" on public.arm_workout_exercise_logs;
create policy "users manage own workout exercise logs" on public.arm_workout_exercise_logs
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own level100 watchlist" on public.arm_level100_watchlist;
create policy "users manage own level100 watchlist" on public.arm_level100_watchlist
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own level100 records" on public.arm_level100_records;
create policy "users manage own level100 records" on public.arm_level100_records
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own import runs" on public.arm_import_runs;
create policy "users manage own import runs" on public.arm_import_runs
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own audit events" on public.arm_audit_events;
create policy "users manage own audit events" on public.arm_audit_events
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "service role can manage arm tracker snapshot versions" on public.arm_tracker_snapshot_versions;
create policy "service role can manage arm tracker snapshot versions" on public.arm_tracker_snapshot_versions
for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop trigger if exists arm_profiles_set_updated_at on public.arm_profiles;
create trigger arm_profiles_set_updated_at before update on public.arm_profiles
for each row execute function public.set_arm_tracker_updated_at();

drop trigger if exists arm_plans_set_updated_at on public.arm_plans;
create trigger arm_plans_set_updated_at before update on public.arm_plans
for each row execute function public.set_arm_tracker_updated_at();

drop trigger if exists arm_sessions_set_updated_at on public.arm_sessions;
create trigger arm_sessions_set_updated_at before update on public.arm_sessions
for each row execute function public.set_arm_tracker_updated_at();

drop trigger if exists arm_plan_exercises_set_updated_at on public.arm_plan_exercises;
create trigger arm_plan_exercises_set_updated_at before update on public.arm_plan_exercises
for each row execute function public.set_arm_tracker_updated_at();

drop trigger if exists arm_workout_logs_set_updated_at on public.arm_workout_logs;
create trigger arm_workout_logs_set_updated_at before update on public.arm_workout_logs
for each row execute function public.set_arm_tracker_updated_at();

drop trigger if exists arm_workout_exercise_logs_set_updated_at on public.arm_workout_exercise_logs;
create trigger arm_workout_exercise_logs_set_updated_at before update on public.arm_workout_exercise_logs
for each row execute function public.set_arm_tracker_updated_at();

drop trigger if exists arm_level100_watchlist_set_updated_at on public.arm_level100_watchlist;
create trigger arm_level100_watchlist_set_updated_at before update on public.arm_level100_watchlist
for each row execute function public.set_arm_tracker_updated_at();

drop trigger if exists arm_level100_records_set_updated_at on public.arm_level100_records;
create trigger arm_level100_records_set_updated_at before update on public.arm_level100_records
for each row execute function public.set_arm_tracker_updated_at();

drop trigger if exists arm_import_runs_set_updated_at on public.arm_import_runs;
create trigger arm_import_runs_set_updated_at before update on public.arm_import_runs
for each row execute function public.set_arm_tracker_updated_at();
