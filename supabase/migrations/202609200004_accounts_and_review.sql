alter table public.profiles
add column if not exists role text not null default 'member'
  check (role in ('member', 'admin'));

alter table public.sightings
drop constraint if exists sightings_status_check;

alter table public.sightings
add constraint sightings_status_check
check (status in ('draft', 'pending_analysis', 'pending_review', 'confirmed', 'rejected'));

alter table public.sightings
add column if not exists submitted_at timestamptz,
add column if not exists reviewed_at timestamptz,
add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
add column if not exists rejection_reason text;

create or replace function public.is_flora_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_flora_admin() from public;
grant execute on function public.is_flora_admin() to authenticated;

drop policy if exists "profiles are readable" on public.profiles;
drop policy if exists "owners and admins read profiles" on public.profiles;
create policy "owners and admins read profiles" on public.profiles
for select to authenticated
using (id = auth.uid() or (select public.is_flora_admin()));

revoke update on public.profiles from authenticated;
grant update (handle) on public.profiles to authenticated;

drop policy if exists "owners read their sightings" on public.sightings;
drop policy if exists "owners and admins read sightings" on public.sightings;
create policy "owners and admins read sightings" on public.sightings
for select to authenticated
using (auth.uid() = user_id or (select public.is_flora_admin()));

drop policy if exists "users update pending sightings" on public.sightings;
drop policy if exists "owners update unapproved sightings" on public.sightings;
create policy "owners update unapproved sightings" on public.sightings
for update to authenticated
using (
  auth.uid() = user_id
  and status in ('draft', 'pending_analysis', 'pending_review', 'rejected')
)
with check (
  auth.uid() = user_id
  and status in ('draft', 'pending_analysis', 'pending_review')
);

drop policy if exists "admins review sightings" on public.sightings;
create policy "admins review sightings" on public.sightings
for update to authenticated
using ((select public.is_flora_admin()))
with check ((select public.is_flora_admin()));

drop policy if exists "owners read sighting analysis" on public.sighting_analysis;
drop policy if exists "owners and admins read sighting analysis" on public.sighting_analysis;
create policy "owners and admins read sighting analysis" on public.sighting_analysis
for select to authenticated
using (
  exists (
    select 1 from public.sightings s
    where s.id = sighting_id
      and (s.user_id = auth.uid() or (select public.is_flora_admin()))
  )
);

drop policy if exists "admins read review photos" on storage.objects;
create policy "admins read review photos" on storage.objects
for select to authenticated
using (
  bucket_id = 'sighting-photos'
  and (select public.is_flora_admin())
);

create or replace function public.submit_sighting_for_review(p_sighting_id uuid)
returns public.sightings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.sightings;
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Create an account before submitting a sighting';
  end if;

  update public.sightings
  set status = 'pending_review',
      submitted_at = now(),
      reviewed_at = null,
      reviewed_by = null,
      rejection_reason = null
  where id = p_sighting_id
    and user_id = auth.uid()
    and status in ('draft', 'pending_review', 'rejected')
  returning * into result;

  if result.id is null then
    raise exception 'Sighting is not available to submit';
  end if;
  return result;
end;
$$;

revoke all on function public.submit_sighting_for_review(uuid) from public;
grant execute on function public.submit_sighting_for_review(uuid) to authenticated;

create or replace function public.review_sighting(
  p_sighting_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.sightings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.sightings;
begin
  if not public.is_flora_admin() then
    raise exception 'Admin access required';
  end if;
  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'Decision must be confirmed or rejected';
  end if;

  update public.sightings
  set status = p_decision,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      rejection_reason = case when p_decision = 'rejected' then nullif(trim(p_reason), '') else null end
  where id = p_sighting_id
    and status = 'pending_review'
  returning * into result;

  if result.id is null then
    raise exception 'Pending sighting not found';
  end if;
  return result;
end;
$$;

revoke all on function public.review_sighting(uuid, text, text) from public;
grant execute on function public.review_sighting(uuid, text, text) to authenticated;

create or replace view public.public_sightings
with (security_barrier = true) as
select
  s.id,
  s.produce_name,
  s.variety,
  s.place_text,
  s.price_text,
  s.observed_at,
  s.status,
  case when s.location is null then null
    else extensions.st_snaptogrid(s.location::extensions.geometry, 0.01)
  end as approximate_location,
  s.farm_text,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', item->>'name',
      'variety', item->'variety',
      'price_text', item->'price_text'
    ))
    from jsonb_array_elements(a.identified_items) item
  ), '[]'::jsonb) as identified_items
from public.sightings s
left join public.sighting_analysis a on a.sighting_id = s.id
where s.status = 'confirmed';

revoke all on public.public_sightings from public;
grant select on public.public_sightings to anon, authenticated;
