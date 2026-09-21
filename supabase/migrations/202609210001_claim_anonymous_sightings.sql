create table public.sighting_account_claims (
  token uuid primary key default extensions.gen_random_uuid(),
  anonymous_user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '1 hour'),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sighting_account_claims enable row level security;
revoke all on public.sighting_account_claims from public, anon, authenticated;

create or replace function public.prepare_sighting_account_claim()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_token uuid;
begin
  if auth.uid() is null or not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'An anonymous Flora session is required';
  end if;

  delete from public.sighting_account_claims
  where anonymous_user_id = auth.uid()
    and claimed_at is null;

  insert into public.sighting_account_claims (anonymous_user_id)
  values (auth.uid())
  returning token into claim_token;

  return claim_token;
end;
$$;

create or replace function public.claim_anonymous_sightings(p_token uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_user_id uuid;
  moved_count integer;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in to claim these sightings';
  end if;

  select anonymous_user_id into source_user_id
  from public.sighting_account_claims
  where token = p_token
    and claimed_at is null
    and expires_at > now()
  for update;

  if source_user_id is null then
    raise exception 'This sighting transfer link is invalid or expired';
  end if;

  update public.sightings
  set user_id = auth.uid()
  where user_id = source_user_id;
  get diagnostics moved_count = row_count;

  update public.sighting_account_claims
  set claimed_by = auth.uid(),
      claimed_at = now()
  where token = p_token;

  return moved_count;
end;
$$;

revoke all on function public.prepare_sighting_account_claim() from public;
revoke all on function public.claim_anonymous_sightings(uuid) from public;
grant execute on function public.prepare_sighting_account_claim() to authenticated;
grant execute on function public.claim_anonymous_sightings(uuid) to authenticated;
