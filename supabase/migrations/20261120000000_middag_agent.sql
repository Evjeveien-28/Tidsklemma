-- Middag, steg 4 og 5: agenten som lager ukesmenyen, og push når den er klar.
-- Agenten (en planlagt oppgave på claude.ai) kaller appen med en egen nøkkel, og appen sender den videre hit.

insert into privat.hemmeligheter values ('middag-agent', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

create function privat.riktig_agentnokkel(nokkel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privat.hemmeligheter where navn = 'middag-agent' and verdi = nokkel);
$$;

-- For prisoppslagene, som ikke rører databasen ellers.
create function middag.agent_nokkel_ok(nokkel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privat.riktig_agentnokkel(nokkel);
$$;

-- Varsel når ukesmenyen er klar. På som standard.
alter table public.push_innstillinger add column middag boolean not null default true;

-- Bestillinger som venter, med alt agenten trenger. Søndag ettermiddag lages det også bestillinger
-- for neste uke til husstander med automatisk meny. Bestillingene som hentes, settes til «jobber».
create function middag.agent_hent(nokkel text)
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
          'min_besparelse', i.min_besparelse, 'hverdag_minutter', i.hverdag_minutter, 'onsker', i.onsker)
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
          'gyldig_til', t.gyldig_til))
        from middag.tilbud t where t.household_id = b.household_id and t.gyldig_til >= now()), '[]'::jsonb),
      'tidligere', coalesce((select jsonb_agg(jsonb_build_object('uke_start', m.uke_start, 'data', m.data, 'valg', m.valg) order by m.uke_start desc)
        from middag.menyer m where m.household_id = b.household_id and m.uke_start < b.uke_start
          and m.uke_start >= b.uke_start - 28), '[]'::jsonb)
    ) order by b.created_at)
    from middag.bestillinger b where b.id = any (ider)), '[]'::jsonb);
end;
$$;

-- Lagrer menyen, gjør bestillingen ferdig, og gir tilbake enhetene som skal ha push.
create function middag.agent_lagre(nokkel text, bid uuid, meny jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b middag.bestillinger;
  ukjent text;
begin
  if not privat.riktig_agentnokkel(nokkel) then
    raise exception 'Ikke tilgang';
  end if;
  select * into b from middag.bestillinger where id = bid;
  if b.id is null or b.status not in ('venter', 'jobber') then
    raise exception 'Bestillingen finnes ikke eller er allerede ferdig';
  end if;

  -- Bare oppskrifter fra husstandens egen kokebok.
  select a ->> 'oppskrift_id' into ukjent
  from jsonb_array_elements(meny -> 'dager') d, jsonb_array_elements(d -> 'alternativer') a
  where not exists (select 1 from middag.oppskrifter o where o.household_id = b.household_id and o.id::text = a ->> 'oppskrift_id')
  limit 1;
  if found then
    raise exception 'Oppskriften % finnes ikke i kokeboka', ukjent;
  end if;

  select d ->> 'dato' into ukjent
  from jsonb_array_elements(meny -> 'dager') d
  where not exists (select 1 from jsonb_array_elements(b.dager) x where x ->> 'dato' = d ->> 'dato')
  limit 1;
  if found then
    raise exception 'Datoen % er ikke med i bestillingen', ukjent;
  end if;

  insert into middag.menyer (household_id, uke_start, data, valg, bestilling_id, laget_at)
  values (b.household_id, b.uke_start, meny, '{}'::jsonb, b.id, now())
  on conflict (household_id, uke_start) do update
    set data = excluded.data, valg = '{}'::jsonb, bestilling_id = excluded.bestilling_id, laget_at = now();
  update middag.bestillinger set status = 'ferdig', melding = null, ferdig_at = now() where id = b.id;

  return jsonb_build_object('uke_start', b.uke_start, 'abonnementer', coalesce((
    select jsonb_agg(jsonb_build_object('endpoint', a.endpoint, 'p256dh', a.p256dh, 'auth', a.auth))
    from public.push_abonnement a
    join public.household_members m on m.user_id = a.user_id and m.household_id = b.household_id
    left join public.push_innstillinger i on i.user_id = a.user_id
    where coalesce(i.middag, true)), '[]'::jsonb));
end;
$$;

-- Agenten fikk det ikke til. Meldingen vises på Middag-siden.
create function middag.agent_feil(nokkel text, bid uuid, melding text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privat.riktig_agentnokkel(nokkel) then
    raise exception 'Ikke tilgang';
  end if;
  update middag.bestillinger set status = 'feil', melding = left(melding, 1000), ferdig_at = now()
  where id = bid and status in ('venter', 'jobber');
end;
$$;

revoke execute on function middag.agent_nokkel_ok(text) from public;
grant execute on function middag.agent_nokkel_ok(text) to anon, authenticated;
revoke execute on function middag.agent_hent(text) from public;
revoke execute on function middag.agent_lagre(text, uuid, jsonb) from public;
revoke execute on function middag.agent_feil(text, uuid, text) from public;
grant execute on function middag.agent_hent(text) to anon, authenticated;
grant execute on function middag.agent_lagre(text, uuid, jsonb) to anon, authenticated;
grant execute on function middag.agent_feil(text, uuid, text) to anon, authenticated;
