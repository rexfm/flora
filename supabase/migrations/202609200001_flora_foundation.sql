create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  aura integer not null default 0 check (aura >= 0),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users for each row execute procedure public.handle_new_user();

create table public.places (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  address text,
  location extensions.geography(point, 4326),
  created_at timestamptz not null default now()
);

create table public.sightings (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid references public.places(id) on delete set null,
  food_text text not null check (char_length(food_text) between 1 and 160),
  produce_name text,
  variety text,
  place_text text,
  price_text text,
  photo_path text,
  location extensions.geography(point, 4326),
  location_source text check (location_source in ('browser_gps', 'photo_exif', 'place')),
  accuracy_meters integer check (accuracy_meters >= 0),
  observed_at timestamptz not null default now(),
  status text not null default 'pending_review' check (status in ('pending_analysis', 'pending_review', 'confirmed', 'rejected')),
  created_at timestamptz not null default now()
);
create index sightings_location_idx on public.sightings using gist(location);
create index sightings_recent_idx on public.sightings(observed_at desc);

create table public.sighting_analysis (
  id uuid primary key default extensions.gen_random_uuid(),
  sighting_id uuid not null unique references public.sightings(id) on delete cascade,
  produce_name text not null,
  variety text,
  condition text,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  model text not null,
  created_at timestamptz not null default now()
);

create table public.aura_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  points integer not null,
  source_type text not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_type, source_type, source_id)
);

create or replace function public.refresh_profile_aura()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
  set aura = coalesce((select sum(points) from public.aura_ledger where user_id = coalesce(new.user_id, old.user_id)), 0)
  where id = coalesce(new.user_id, old.user_id);
  return coalesce(new, old);
end;
$$;
create trigger refresh_aura_after_change
after insert or update or delete on public.aura_ledger
for each row execute procedure public.refresh_profile_aura();

create table public.requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  produce_query text not null check (char_length(produce_query) between 1 and 160),
  requirements text,
  search_center extensions.geography(point, 4326),
  radius_km numeric(6,2) check (radius_km > 0),
  deadline timestamptz,
  status text not null default 'open' check (status in ('open', 'fulfilled', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.bounties (
  id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  reward_type text not null default 'aura' check (reward_type in ('aura', 'cash')),
  aura_points integer check (aura_points > 0),
  amount_cents integer check (amount_cents > 0),
  currency text not null default 'usd',
  status text not null default 'open' check (status in ('open', 'submitted', 'awarded', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  check ((reward_type = 'aura' and aura_points is not null and amount_cents is null) or (reward_type = 'cash' and amount_cents is not null and aura_points is null))
);

create table public.bounty_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  bounty_id uuid not null references public.bounties(id) on delete cascade,
  submitter_id uuid not null references public.profiles(id) on delete cascade,
  sighting_id uuid not null references public.sightings(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (bounty_id, sighting_id)
);

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.sightings enable row level security;
alter table public.sighting_analysis enable row level security;
alter table public.aura_ledger enable row level security;
alter table public.requests enable row level security;
alter table public.bounties enable row level security;
alter table public.bounty_submissions enable row level security;

create policy "profiles are readable" on public.profiles for select using (true);
create policy "owners update profiles" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "places are readable" on public.places for select using (true);
create policy "confirmed or owned sightings are readable" on public.sightings for select using (status = 'confirmed' or auth.uid() = user_id);
create policy "users create their sightings" on public.sightings for insert with check (auth.uid() = user_id);
create policy "users update pending sightings" on public.sightings for update using (auth.uid() = user_id and status in ('pending_analysis', 'pending_review')) with check (auth.uid() = user_id);
create policy "owners read sighting analysis" on public.sighting_analysis for select using (exists (select 1 from public.sightings s where s.id = sighting_id and (s.user_id = auth.uid() or s.status = 'confirmed')));
create policy "aura is readable" on public.aura_ledger for select using (true);
create policy "requests are readable" on public.requests for select using (true);
create policy "users create requests" on public.requests for insert with check (auth.uid() = user_id);
create policy "owners update requests" on public.requests for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bounties are readable" on public.bounties for select using (true);
create policy "users create aura bounties" on public.bounties for insert with check (auth.uid() = creator_id and reward_type = 'aura');
create policy "owners update bounties" on public.bounties for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);
create policy "submissions are readable by participants" on public.bounty_submissions for select using (auth.uid() = submitter_id or exists (select 1 from public.bounties b where b.id = bounty_id and b.creator_id = auth.uid()));
create policy "users submit their sightings" on public.bounty_submissions for insert with check (auth.uid() = submitter_id and exists (select 1 from public.sightings s where s.id = sighting_id and s.user_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sighting-photos', 'sighting-photos', false, 10485760, array['image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload their own sighting photos" on storage.objects for insert to authenticated
with check (bucket_id = 'sighting-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users read their own sighting photos" on storage.objects for select to authenticated
using (bucket_id = 'sighting-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete their own sighting photos" on storage.objects for delete to authenticated
using (bucket_id = 'sighting-photos' and (storage.foldername(name))[1] = auth.uid()::text);

