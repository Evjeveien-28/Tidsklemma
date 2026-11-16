-- Pakkeliste, innstillinger: det som alltid skal med (per person og felles), og instruksjoner til agenten.
-- Det som alltid skal med, legges på listen med en gang turen lages. Agenten får begge deler.

create table pakkeliste.innstillinger (
  household_id uuid primary key references public.households (id) on delete cascade,
  -- F.eks. «Vi kjører alltid bil. Vi har sengetøy på hytta. Mia fryser lett.»
  instruksjoner text not null default '' check (length(instruksjoner) <= 2000),
  updated_at timestamptz not null default now()
);

create table pakkeliste.alltid (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Hvem det er til. Null er felles.
  person_id uuid references public.household_people (id) on delete cascade,
  navn text not null check (length(trim(navn)) between 1 and 120),
  antall smallint not null default 1 check (antall between 1 and 99),
  created_at timestamptz not null default now()
);

create index on pakkeliste.alltid (household_id);

alter table pakkeliste.innstillinger enable row level security;
alter table pakkeliste.alltid enable row level security;
grant select, insert, update on pakkeliste.innstillinger to authenticated;
grant select, insert, update, delete on pakkeliste.alltid to authenticated;

create policy "Medlemmer ser innstillinger" on pakkeliste.innstillinger for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer lager innstillinger" on pakkeliste.innstillinger for insert to authenticated
  with check (public.is_household_member(household_id));
create policy "Medlemmer endrer innstillinger" on pakkeliste.innstillinger for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

create policy "Medlemmer ser alltid med" on pakkeliste.alltid for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer legger til alltid med" on pakkeliste.alltid for insert to authenticated
  with check (public.is_household_member(household_id));
create policy "Medlemmer endrer alltid med" on pakkeliste.alltid for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Medlemmer fjerner alltid med" on pakkeliste.alltid for delete to authenticated
  using (public.is_household_member(household_id));

-- Ting som kom fra «alltid med».
alter table pakkeliste.ting drop constraint ting_kilde_check;
alter table pakkeliste.ting add constraint ting_kilde_check check (kilde in ('manuell', 'agent', 'alltid'));

-- Samme som før, men agenten får instruksjonene og det som alltid skal med.
create or replace function pakkeliste.agent_hent(nokkel text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ider uuid[];
  ut jsonb;
begin
  if not privat.riktig_agentnokkel(nokkel) then
    raise exception 'Ikke tilgang';
  end if;
  -- Ble en kjøring avbrutt, prøver vi igjen.
  update pakkeliste.turer set forslag_status = 'venter'
  where forslag_status = 'jobber' and forslag_bestilt_at < now() - interval '1 hour';

  with valgt as (
    update pakkeliste.turer set forslag_status = 'jobber' where forslag_status = 'venter' returning id
  ) select coalesce(array_agg(id), '{}') into ider from valgt;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tur', jsonb_build_object('id', t.id, 'tittel', t.tittel, 'beskrivelse', t.beskrivelse, 'sted', t.sted, 'fra', t.fra, 'til', t.til),
    'personer', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'navn', p.navn, 'fodselsar', p.fodselsar))
      from public.household_people p where p.id = any (t.personer)), '[]'::jsonb),
    -- Husstandens egne instruksjoner, f.eks. «Vi kjører alltid bil».
    'instruksjoner', coalesce((select i.instruksjoner from pakkeliste.innstillinger i where i.household_id = t.household_id), ''),
    -- Det som alltid skal med, per person (person_id) og felles (null). Står allerede på listen, se pa_listen.
    'alltid', coalesce((select jsonb_agg(jsonb_build_object('person_id', a.person_id, 'navn', a.navn, 'antall', a.antall))
      from pakkeliste.alltid a where a.household_id = t.household_id
        and (a.person_id is null or a.person_id = any (t.personer))), '[]'::jsonb),
    -- Det som allerede står på listen (også det som er fjernet, så det ikke foreslås igjen).
    'pa_listen', coalesce((select jsonb_agg(jsonb_build_object('person_id', g.person_id, 'navn', g.navn, 'antall', g.antall, 'fjernet', g.fjernet_at is not null))
      from pakkeliste.ting g where g.tur_id = t.id), '[]'::jsonb),
    -- Låste lister fra tidligere turer: slik familien vil ha det. Navnet på personen, siden id-ene er de samme i husstanden.
    'tidligere', coalesce((select jsonb_agg(x order by x ->> 'fra' desc) from (
      select jsonb_build_object('tittel', f.tittel, 'beskrivelse', f.beskrivelse, 'sted', f.sted, 'fra', f.fra, 'til', f.til,
        'ting', coalesce((select jsonb_agg(jsonb_build_object('person', p.navn, 'navn', g.navn, 'antall', g.antall))
          from pakkeliste.ting g left join public.household_people p on p.id = g.person_id
          where g.tur_id = f.id and g.fjernet_at is null), '[]'::jsonb)) as x
      from pakkeliste.turer f
      where f.household_id = t.household_id and f.id <> t.id and f.laast_at is not null
      order by f.fra desc limit 8) l), '[]'::jsonb),
    -- Det agenten har foreslått før, men som husstanden fjernet: ikke foreslå det igjen uten god grunn.
    'fjernet_for', coalesce((select jsonb_agg(jsonb_build_object('person', r.person, 'navn', r.navn, 'ganger', r.ganger)) from (
      select p.navn as person, lower(g.navn) as navn, count(*) as ganger
      from pakkeliste.ting g left join public.household_people p on p.id = g.person_id
      where g.household_id = t.household_id and g.kilde = 'agent' and g.fjernet_at is not null and g.tur_id <> t.id
        and g.created_at > now() - interval '18 months'
      group by p.navn, lower(g.navn) order by count(*) desc limit 100) r), '[]'::jsonb)
  ) order by t.forslag_bestilt_at), '[]'::jsonb) into ut
  from pakkeliste.turer t where t.id = any (ider);
  return ut;
end;
$$;
