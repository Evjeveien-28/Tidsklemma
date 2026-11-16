-- Pakkeliste, steg 2: agenten foreslår pakkelisten. Den samme agenten som lager ukesmenyen (Middag) plukker opp
-- turer der husstanden har bedt om forslag. Appen henter været og gir det til agenten.

alter table pakkeliste.turer
  add column forslag_status text check (forslag_status in ('venter', 'jobber', 'ferdig', 'feil')),
  add column forslag_bestilt_at timestamptz,
  -- Kort fra agenten, f.eks. om været. Eller en feilmelding.
  add column forslag_merknad text check (length(forslag_merknad) <= 1000);

grant usage on schema pakkeliste to anon;

-- Turene som venter på forslag, med det agenten trenger. Settes til «jobber».
create function pakkeliste.agent_hent(nokkel text)
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

-- Lagrer forslaget: nye ting legges til listen. Det som allerede står der, eller er fjernet fra denne turen, hoppes over.
create function pakkeliste.agent_lagre(nokkel text, tid uuid, ting jsonb, merknad text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t pakkeliste.turer;
  lagt_til integer;
begin
  if not privat.riktig_agentnokkel(nokkel) then
    raise exception 'Ikke tilgang';
  end if;
  select * into t from pakkeliste.turer where id = tid;
  if t.id is null or t.forslag_status not in ('venter', 'jobber') then
    raise exception 'Turen finnes ikke eller venter ikke på forslag';
  end if;

  -- I rekkefølgen agenten sendte dem (created_at øker per rad), uten dobbelt opp.
  insert into pakkeliste.ting (tur_id, household_id, person_id, navn, antall, kilde, created_at)
  select t.id, t.household_id, n.person_id, left(trim(n.navn), 120), least(greatest(coalesce(n.antall, 1), 1), 99), 'agent', clock_timestamp()
  from jsonb_array_elements(ting) with ordinality as e(verdi, nr),
    lateral jsonb_to_record(e.verdi) as n(person_id uuid, navn text, antall integer)
  where length(trim(coalesce(n.navn, ''))) between 1 and 120
    and (n.person_id is null or n.person_id = any (t.personer))
    and not exists (select 1 from pakkeliste.ting g where g.tur_id = t.id
      and g.person_id is not distinct from n.person_id and lower(g.navn) = lower(trim(n.navn)))
    and not exists (select 1 from jsonb_array_elements(ting) with ordinality as f(verdi, nr)
      where f.nr < e.nr and (f.verdi ->> 'person_id') is not distinct from (e.verdi ->> 'person_id')
        and lower(trim(f.verdi ->> 'navn')) = lower(trim(n.navn)))
  order by e.nr
  limit 250;
  get diagnostics lagt_til = row_count;

  update pakkeliste.turer set forslag_status = 'ferdig', forslag_merknad = left(merknad, 1000) where id = t.id;
  return lagt_til;
end;
$$;

-- Agenten fikk det ikke til. Meldingen vises på turen.
create function pakkeliste.agent_feil(nokkel text, tid uuid, melding text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privat.riktig_agentnokkel(nokkel) then
    raise exception 'Ikke tilgang';
  end if;
  update pakkeliste.turer set forslag_status = 'feil', forslag_merknad = left(melding, 1000)
  where id = tid and forslag_status in ('venter', 'jobber');
end;
$$;

revoke execute on function pakkeliste.agent_hent(text) from public;
revoke execute on function pakkeliste.agent_lagre(text, uuid, jsonb, text) from public;
revoke execute on function pakkeliste.agent_feil(text, uuid, text) from public;
grant execute on function pakkeliste.agent_hent(text) to anon, authenticated;
grant execute on function pakkeliste.agent_lagre(text, uuid, jsonb, text) to anon, authenticated;
grant execute on function pakkeliste.agent_feil(text, uuid, text) to anon, authenticated;
