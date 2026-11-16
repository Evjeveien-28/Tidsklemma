-- Pakkeliste: turer med en pakkeliste per person og felles. Alle i husstanden pakker sammen og ser hva de andre har pakket.
-- Forslag fra agenten kommer i neste steg. Fjernede ting beholdes (fjernet_at), så agenten kan lære hva vi ikke vil ha.

create schema pakkeliste;
grant usage on schema pakkeliste to authenticated;

create table pakkeliste.turer (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  tittel text not null check (length(trim(tittel)) between 1 and 80),
  -- Hva vi skal, med egne ord: «Hytta på Hafjell, skikjøring og en middag ute».
  beskrivelse text not null default '' check (length(beskrivelse) <= 2000),
  sted text not null default '' check (length(sted) <= 120),
  fra date not null,
  til date not null check (til >= fra and til - fra <= 90),
  -- Hvem i husstanden som skal være med (household_people).
  personer uuid[] not null default '{}' check (cardinality(personer) <= 20),
  -- Låst: listen er slik vi vil ha den, og agenten kan lære av den.
  laast_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index on pakkeliste.turer (household_id, fra);

create table pakkeliste.ting (
  id uuid primary key default gen_random_uuid(),
  tur_id uuid not null references pakkeliste.turer (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  -- Hvem tingen er til. Null er felles.
  person_id uuid references public.household_people (id) on delete set null,
  navn text not null check (length(trim(navn)) between 1 and 120),
  antall smallint not null default 1 check (antall between 1 and 99),
  kilde text not null default 'manuell' check (kilde in ('manuell', 'agent')),
  pakket_at timestamptz,
  pakket_av uuid references auth.users (id) on delete set null,
  fjernet_at timestamptz,
  created_at timestamptz not null default now()
);

create index on pakkeliste.ting (tur_id);

alter table pakkeliste.turer enable row level security;
alter table pakkeliste.ting enable row level security;
grant select, insert, update, delete on pakkeliste.turer to authenticated;
grant select, insert, update, delete on pakkeliste.ting to authenticated;

create policy "Medlemmer ser turer" on pakkeliste.turer for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer lager turer" on pakkeliste.turer for insert to authenticated
  with check (public.is_household_member(household_id));
create policy "Medlemmer endrer turer" on pakkeliste.turer for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Medlemmer sletter turer" on pakkeliste.turer for delete to authenticated
  using (public.is_household_member(household_id));

-- Tingen må høre til en tur i samme husstand.
create policy "Medlemmer ser ting" on pakkeliste.ting for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer legger til ting" on pakkeliste.ting for insert to authenticated
  with check (public.is_household_member(household_id)
    and exists (select 1 from pakkeliste.turer t where t.id = tur_id and t.household_id = ting.household_id));
create policy "Medlemmer endrer ting" on pakkeliste.ting for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id)
    and exists (select 1 from pakkeliste.turer t where t.id = tur_id and t.household_id = ting.household_id));
create policy "Medlemmer sletter ting" on pakkeliste.ting for delete to authenticated
  using (public.is_household_member(household_id));
