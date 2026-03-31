create table if not exists public.arm_tracker_snapshots (
  owner_key text primary key,
  snapshot jsonb not null,
  seed_version text,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_arm_tracker_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists arm_tracker_snapshots_set_updated_at on public.arm_tracker_snapshots;

create trigger arm_tracker_snapshots_set_updated_at
before update on public.arm_tracker_snapshots
for each row
execute function public.set_arm_tracker_updated_at();

alter table public.arm_tracker_snapshots enable row level security;

drop policy if exists "service role can manage arm tracker snapshots" on public.arm_tracker_snapshots;

create policy "service role can manage arm tracker snapshots"
on public.arm_tracker_snapshots
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
