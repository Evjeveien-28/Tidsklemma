-- Middag, steg 2: ukens tilbud fra kundeavisene (eTilbudsavis/Tjek), hentet hver natt for hver husstand.

-- Posisjonen til postnummeret, slått opp hos Kartverket når innstillingene lagres.
alter table middag.innstillinger
  add column sted text check (length(sted) <= 80),
  add column lat double precision,
  add column lng double precision;

create table middag.tilbud (
  household_id uuid not null references public.households (id) on delete cascade,
  -- Id-en tilbudet har hos Tjek.
  id text not null check (length(id) <= 100),
  butikk text not null check (length(butikk) <= 40),
  navn text not null check (length(navn) <= 300),
  beskrivelse text not null default '' check (length(beskrivelse) <= 2000),
  pris numeric(10, 2) not null,
  forpris numeric(10, 2),
  -- Mengde per pakning, f.eks. 400–400 g.
  mengde_fra numeric,
  mengde_til numeric,
  enhet text check (length(enhet) <= 20),
  gyldig_fra timestamptz not null,
  gyldig_til timestamptz not null,
  bilde_url text check (length(bilde_url) <= 2000),
  hentet_at timestamptz not null default now(),
  primary key (household_id, id)
);

create index on middag.tilbud (household_id, butikk);

alter table middag.tilbud enable row level security;
grant select, insert, delete on middag.tilbud to authenticated;

create policy "Medlemmer ser tilbud" on middag.tilbud for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer henter tilbud" on middag.tilbud for insert to authenticated
  with check (public.is_household_member(household_id));
create policy "Medlemmer fjerner tilbud" on middag.tilbud for delete to authenticated
  using (public.is_household_member(household_id));

-- Jobben hver natt kaller funksjonene uten innlogging. Tabellene har ingen tilgang for anon.
grant usage on schema middag to anon;

-- Husstandene som skal ha tilbud: de som har postnummer.
create function middag.tilbud_grunnlag(hemmelig text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privat.riktig_hemmelighet(hemmelig) then
    raise exception 'Ikke tilgang';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('household_id', household_id, 'butikker', butikker, 'lat', lat, 'lng', lng))
    from middag.innstillinger where lat is not null and lng is not null), '[]'::jsonb);
end;
$$;

-- Bytter ut husstandens tilbud med de nye.
create function middag.lagre_tilbud(hemmelig text, hid uuid, nye jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privat.riktig_hemmelighet(hemmelig) then
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

revoke execute on function middag.tilbud_grunnlag(text) from public;
revoke execute on function middag.lagre_tilbud(text, uuid, jsonb) from public;
grant execute on function middag.tilbud_grunnlag(text) to anon, authenticated;
grant execute on function middag.lagre_tilbud(text, uuid, jsonb) to anon, authenticated;

-- Hver natt kl. 04 norsk vintertid (03:00 UTC). Kundeavisene skifter som regel søndag kveld eller mandag.
select cron.schedule(
  'tidsklemma-middag-tilbud',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://tidsklemma.vercel.app/api/middag/tilbud',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hemmelighet', (select verdi from privat.hemmeligheter where navn = 'push')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
