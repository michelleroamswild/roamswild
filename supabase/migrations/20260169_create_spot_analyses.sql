-- Cache AI-powered campsite analyses so we don't re-analyze the same spot
create table if not exists spot_analyses (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  -- Round to 5 decimal places (~1m) for matching
  lat_key double precision generated always as (round(lat::numeric, 5)::double precision) stored,
  lng_key double precision generated always as (round(lng::numeric, 5)::double precision) stored,
  spot_name text,
  spot_type text,
  analysis jsonb not null,
  model_version text not null default 'gemini-2.5-flash',
  created_at timestamptz not null default now()
);

-- Index for coordinate lookups
create index if not exists idx_spot_analyses_coords on spot_analyses (lat_key, lng_key);

-- Enable RLS
alter table spot_analyses enable row level security;

-- Anyone can read cached analyses
create policy "Anyone can read spot analyses"
  on spot_analyses for select
  using (true);

-- Allow inserts from service role (edge functions)
create policy "Service role can insert spot analyses"
  on spot_analyses for insert
  with check (true);
