-- Middag, steg 3: bestillinger av ukesmeny, og menyene agenten lager.

-- En bestilling: «lag meny for denne uka». Agenten (steg 4) plukker opp de som venter.
create table middag.bestillinger (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Mandagen i uka menyen gjelder.
  uke_start date not null check (extract(isodow from uke_start) = 1),
  -- Per dag: { "dato": "2026-11-17", "oppskrift_id": null | uuid, "borte": [person-id …], "gjester": 0 }.
  dager jsonb not null check (jsonb_typeof(dager) = 'array'),
  status text not null default 'venter' check (status in ('venter', 'jobber', 'ferdig', 'feil')),
  melding text check (length(melding) <= 1000),
  bestilt_av uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  ferdig_at timestamptz
);

create index on middag.bestillinger (household_id, created_at desc);
create index on middag.bestillinger (status) where status in ('venter', 'jobber');

-- Menyen for en uke. data har dager med tre alternativer, og innkjøp med pris per butikk.
-- valg er det husstanden har valgt: per dato alternativ eller egen oppskrift, og varer vi har hjemme.
create table middag.menyer (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  uke_start date not null check (extract(isodow from uke_start) = 1),
  data jsonb not null,
  valg jsonb not null default '{}'::jsonb,
  bestilling_id uuid references middag.bestillinger (id) on delete set null,
  laget_at timestamptz not null default now(),
  unique (household_id, uke_start)
);

alter table middag.bestillinger enable row level security;
alter table middag.menyer enable row level security;
grant select, insert on middag.bestillinger to authenticated;
grant select on middag.menyer to authenticated;
-- Medlemmer kan bare endre valgene sine, ikke selve menyen.
grant update (valg) on middag.menyer to authenticated;

create policy "Medlemmer ser bestillinger" on middag.bestillinger for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer bestiller" on middag.bestillinger for insert to authenticated
  with check (public.is_household_member(household_id) and status = 'venter');

create policy "Medlemmer ser menyer" on middag.menyer for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer velger i menyen" on middag.menyer for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
