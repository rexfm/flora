alter table public.sighting_analysis
add column if not exists identified_items jsonb not null default '[]'::jsonb;

create or replace function public.nearby_places(
  longitude double precision,
  latitude double precision,
  radius_meters integer default 1500
)
returns table (
  id uuid,
  name text,
  address text,
  distance_meters integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with origin as (
    select extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography as point
  )
  select p.id, p.name, p.address,
    round(extensions.st_distance(p.location, origin.point))::integer as distance_meters
  from public.places p
  cross join origin
  where p.location is not null
    and extensions.st_dwithin(p.location, origin.point, least(greatest(radius_meters, 50), 10000))
  order by extensions.st_distance(p.location, origin.point)
  limit 8;
$$;

grant execute on function public.nearby_places(double precision, double precision, integer) to authenticated;

drop policy if exists "confirmed or owned sightings are readable" on public.sightings;
create policy "owners read their sightings" on public.sightings
for select using (auth.uid() = user_id);

create or replace view public.public_sightings
with (security_barrier = true) as
select
  id,
  produce_name,
  variety,
  place_text,
  price_text,
  observed_at,
  status,
  case when location is null then null
    else extensions.st_snaptogrid(location::extensions.geometry, 0.01)
  end as approximate_location
from public.sightings
where status = 'confirmed';

revoke all on public.public_sightings from public;
grant select on public.public_sightings to anon, authenticated;
