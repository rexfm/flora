alter table public.sightings
add column if not exists farm_text text;

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
  end as approximate_location,
  farm_text
from public.sightings
where status = 'confirmed';

revoke all on public.public_sightings from public;
grant select on public.public_sightings to anon, authenticated;
