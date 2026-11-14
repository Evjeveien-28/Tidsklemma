-- Middag, steg 1: innstillinger, allergier og oppskriftsbok. Meny, tilbud og agent kommer senere.

create schema middag;
grant usage on schema middag to authenticated;

create table middag.innstillinger (
  household_id uuid primary key references public.households (id) on delete cascade,
  voksne smallint not null default 2 check (voksne between 0 and 20),
  -- Alderen til hvert barn, f.eks. {4, 9}.
  barn_alder smallint[] not null default '{}',
  -- Ukedagene det skal foreslås middag for: 1 = mandag … 7 = søndag.
  dager smallint[] not null default '{1,2,3,4,5,6,7}' check (dager <@ '{1,2,3,4,5,6,7}'),
  -- Butikker i prioritert rekkefølge, f.eks. {KIWI, COOP_EXTRA}.
  butikker text[] not null default '{KIWI}',
  maks_butikker smallint not null default 1 check (maks_butikker between 1 and 3),
  -- Del bare opp handelen hvis vi sparer minst så mange kroner.
  min_besparelse integer not null default 50 check (min_besparelse >= 0),
  postnummer text check (postnummer ~ '^[0-9]{4}$'),
  hverdag_minutter smallint not null default 45 check (hverdag_minutter between 10 and 240),
  -- Mat vi ikke spiser (ikke allergi), f.eks. «lever, sopp».
  unngaa text not null default '' check (length(unngaa) <= 500),
  onsker text not null default '' check (length(onsker) <= 1000),
  -- Ny meny automatisk søndag kveld.
  aktiv boolean not null default false,
  updated_at timestamptz not null default now()
);

create table middag.allergier (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  navn text not null check (length(trim(navn)) between 1 and 60),
  -- Null betyr alle i husstanden.
  person_id uuid references public.household_people (id) on delete cascade,
  -- streng: ingen spor. hoved: bare hovedingredienser, litt i saus går fint. helst: velg uten når det er enkelt.
  grad text not null default 'streng' check (grad in ('streng', 'hoved', 'helst')),
  -- variant: egen variant til den det gjelder. bytt: bytt for alle. unnga: ikke foreslå retten.
  handtering text not null default 'variant' check (handtering in ('variant', 'bytt', 'unnga')),
  erstatning text not null default '' check (length(erstatning) <= 300),
  created_at timestamptz not null default now()
);

create index on middag.allergier (household_id);

create table middag.oppskrifter (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  navn text not null check (length(trim(navn)) between 1 and 200),
  lenke text check (lenke ~ '^https?://' and length(lenke) <= 2000),
  -- Én linje per ingrediens, f.eks. «400 g kyllingfilet».
  ingredienser text[] not null default '{}',
  fremgangsmaate text not null default '' check (length(fremgangsmaate) <= 20000),
  minutter smallint check (minutter between 1 and 1440),
  porsjoner smallint check (porsjoner between 1 and 100),
  merkelapper text[] not null default '{}',
  bilde_url text check (length(bilde_url) <= 2000),
  -- Stjernemerket: agenten velger den oftere.
  favoritt boolean not null default false,
  -- Allerede tilpasset allergiene våre, skal ikke endres.
  trygg boolean not null default false,
  -- Bare lenke, og siden hadde ikke oppskriften i lesbar form. Agenten fyller inn.
  trenger_utfylling boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on middag.oppskrifter (household_id);

alter table middag.innstillinger enable row level security;
alter table middag.allergier enable row level security;
alter table middag.oppskrifter enable row level security;
grant select, insert, update on middag.innstillinger to authenticated;
grant select, insert, update, delete on middag.allergier to authenticated;
grant select, insert, update, delete on middag.oppskrifter to authenticated;

create policy "Medlemmer ser innstillinger" on middag.innstillinger for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer lager innstillinger" on middag.innstillinger for insert to authenticated
  with check (public.is_household_member(household_id));
create policy "Medlemmer endrer innstillinger" on middag.innstillinger for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

create policy "Medlemmer ser allergier" on middag.allergier for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer legger til allergier" on middag.allergier for insert to authenticated
  with check (public.is_household_member(household_id));
create policy "Medlemmer endrer allergier" on middag.allergier for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Medlemmer sletter allergier" on middag.allergier for delete to authenticated
  using (public.is_household_member(household_id));

create policy "Medlemmer ser oppskrifter" on middag.oppskrifter for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer legger til oppskrifter" on middag.oppskrifter for insert to authenticated
  with check (public.is_household_member(household_id));
create policy "Medlemmer endrer oppskrifter" on middag.oppskrifter for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Medlemmer sletter oppskrifter" on middag.oppskrifter for delete to authenticated
  using (public.is_household_member(household_id));
