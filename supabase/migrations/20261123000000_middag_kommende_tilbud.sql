-- Middag: agenten henter ferske tilbud før den lager menyen, og ser bare tilbudene som gjelder i menyuka.
-- Kundeavisene for neste uke kommer søndag, så tilbudene fra natt til lørdag/søndag er for gamle til søndagsmenyen.

-- Tilbudsfunksjonene godtar nå også agentnøkkelen, og forteller når tilbudene sist ble hentet.
create or replace function middag.tilbud_grunnlag(hemmelig text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privat.riktig_hemmelighet(hemmelig) or privat.riktig_agentnokkel(hemmelig)) then
    raise exception 'Ikke tilgang';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('household_id', i.household_id, 'butikker', i.butikker, 'lat', i.lat, 'lng', i.lng,
      'hentet', (select max(t.hentet_at) from middag.tilbud t where t.household_id = i.household_id)))
    from middag.innstillinger i where i.lat is not null and i.lng is not null), '[]'::jsonb);
end;
$$;

create or replace function middag.lagre_tilbud(hemmelig text, hid uuid, nye jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (privat.riktig_hemmelighet(hemmelig) or privat.riktig_agentnokkel(hemmelig)) then
    raise exception 'Ikke tilgang';
  end if;
  delete from middag.tilbud where household_id = hid;
  insert into middag.tilbud (household_id, id, butikk, navn, beskrivelse, pris, forpris, mengde_fra, mengde_til, enhet, gyldig_fra, gyldig_til, bilde_url)
  select hid, t.id, t.butikk, t.navn, coalesce(t.beskrivelse, ''), t.pris, t.forpris, t.mengde_fra, t.mengde_til, t.enhet, t.gyldig_fra, t.gyldig_til, t.bilde_url
  from jsonb_to_recordset(nye) as t(id text, butikk text, navn text, beskrivelse text, pris numeric, forpris numeric,
    mengde_fra numeric, mengde_til numeric, enhet text, gyldig_fra timestamptz, gyldig_til timestamptz, bilde_url text)
  on conflict do nothing;
end;
$$;

-- Samme som før, men bare tilbud som gjelder i menyuka, med når de starter.
create or replace function middag.agent_hent(nokkel text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  na timestamp := now() at time zone 'Europe/Oslo';
  neste date := (na::date + (8 - extract(isodow from na)::int));
  ider uuid[];
begin
  if not privat.riktig_agentnokkel(nokkel) then
    raise exception 'Ikke tilgang';
  end if;

  if extract(isodow from na) = 7 and extract(hour from na) >= 16 then
    insert into middag.bestillinger (household_id, uke_start, dager, bestilt_av)
    select i.household_id, neste,
      (select jsonb_agg(jsonb_build_object('dato', neste + (d - 1), 'oppskrift_id', null, 'borte', '[]'::jsonb, 'gjester', 0) order by d)
       from unnest(i.dager) d),
      null
    from middag.innstillinger i
    where i.aktiv and cardinality(i.dager) > 0
      and not exists (select 1 from middag.menyer m where m.household_id = i.household_id and m.uke_start = neste)
      and not exists (select 1 from middag.bestillinger b where b.household_id = i.household_id and b.uke_start = neste);
  end if;

  -- Ble en kjøring avbrutt, prøver vi igjen.
  update middag.bestillinger set status = 'venter' where status = 'jobber' and created_at < now() - interval '1 hour';
  -- Bare den nyeste bestillingen per uke teller.
  update middag.bestillinger b set status = 'ferdig', melding = 'Erstattet av en nyere bestilling', ferdig_at = now()
  where b.status = 'venter' and exists (
    select 1 from middag.bestillinger n where n.household_id = b.household_id and n.uke_start = b.uke_start
      and n.status in ('venter', 'jobber') and n.created_at > b.created_at);

  with valgt as (
    update middag.bestillinger set status = 'jobber' where status = 'venter' returning id
  ) select coalesce(array_agg(id), '{}') into ider from valgt;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'bestilling', jsonb_build_object('id', b.id, 'uke_start', b.uke_start, 'dager', b.dager),
      'innstillinger', (select jsonb_build_object('butikker', i.butikker, 'maks_butikker', i.maks_butikker,
          'min_besparelse', i.min_besparelse, 'hverdag_minutter', i.hverdag_minutter, 'onsker', i.onsker, 'basisvarer', i.basisvarer)
        from middag.innstillinger i where i.household_id = b.household_id),
      'personer', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'navn', p.navn, 'fodselsar', p.fodselsar))
        from public.household_people p where p.household_id = b.household_id), '[]'::jsonb),
      'allergier', coalesce((select jsonb_agg(jsonb_build_object('navn', a.navn, 'person_id', a.person_id, 'grad', a.grad,
          'handtering', a.handtering, 'erstatning', a.erstatning))
        from middag.allergier a where a.household_id = b.household_id), '[]'::jsonb),
      'oppskrifter', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'navn', o.navn, 'ingredienser', o.ingredienser,
          'minutter', o.minutter, 'porsjoner', o.porsjoner, 'merkelapper', o.merkelapper, 'favoritt', o.favoritt, 'trygg', o.trygg))
        from middag.oppskrifter o where o.household_id = b.household_id), '[]'::jsonb),
      'tilbud', coalesce((select jsonb_agg(jsonb_build_object('butikk', t.butikk, 'navn', t.navn, 'beskrivelse', left(t.beskrivelse, 200),
          'pris', t.pris, 'forpris', t.forpris, 'mengde_fra', t.mengde_fra, 'mengde_til', t.mengde_til, 'enhet', t.enhet,
          'gyldig_fra', t.gyldig_fra, 'gyldig_til', t.gyldig_til))
        from middag.tilbud t where t.household_id = b.household_id and t.gyldig_til >= greatest(now(), b.uke_start::timestamptz)
          and t.gyldig_fra < (b.uke_start + 7)::timestamptz), '[]'::jsonb),
      'tidligere', coalesce((select jsonb_agg(jsonb_build_object('uke_start', m.uke_start, 'data', m.data, 'valg', m.valg) order by m.uke_start desc)
        from middag.menyer m where m.household_id = b.household_id and m.uke_start < b.uke_start
          and m.uke_start >= b.uke_start - 28), '[]'::jsonb)
    ) order by b.created_at)
    from middag.bestillinger b where b.id = any (ider)), '[]'::jsonb);
end;
$$;
