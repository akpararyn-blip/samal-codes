
-- codes table
create table public.codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_string text not null unique,
  created_at timestamptz not null default now()
);

create index codes_user_created_idx on public.codes (user_id, created_at desc);

alter table public.codes enable row level security;

create policy "Users can view their own codes"
  on public.codes for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own codes"
  on public.codes for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 24-hour cooldown trigger
create or replace function public.enforce_codes_24h()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_at timestamptz;
begin
  select max(created_at) into last_at
  from public.codes
  where user_id = new.user_id;

  if last_at is not null and now() < last_at + interval '24 hours' then
    raise exception 'CODE_COOLDOWN_ACTIVE'
      using errcode = 'P0001',
            hint = (extract(epoch from (last_at + interval '24 hours' - now())))::text;
  end if;

  return new;
end;
$$;

create trigger codes_enforce_24h
  before insert on public.codes
  for each row execute function public.enforce_codes_24h();

-- otp_codes table for mocked phone OTP
create table public.otp_codes (
  phone text primary key,
  code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.otp_codes enable row level security;
-- no policies: only the service-role admin client can read/write
