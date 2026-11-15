-- Middag: agenten fyller inn oppskrifter der appen ikke klarte å lese ingrediensene fra siden.
-- Appen henter siden og gir agenten teksten. Hver oppskrift prøves høyst én gang i uka.

alter table middag.oppskrifter add column utfylling_forsokt timestamptz;

-- Oppskriftene som skal fylles inn nå (høyst fem om gangen). Markeres som forsøkt.
create function middag.agent_utfylling(nokkel text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ut jsonb;
begin
  if not privat.riktig_agentnokkel(nokkel) then
    raise exception 'Ikke tilgang';
  end if;
  with valgt as (
    update middag.oppskrifter o set utfylling_forsokt = now()
    where o.id in (
      select id from middag.oppskrifter
      where trenger_utfylling and lenke is not null
        and (utfylling_forsokt is null or utfylling_forsokt < now() - interval '7 days')
      order by created_at
      limit 5)
    returning o.id, o.navn, o.lenke)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'navn', navn, 'lenke', lenke)), '[]'::jsonb) into ut from valgt;
  return ut;
end;
$$;

-- Lagrer det agenten fant. Bare for oppskrifter som fortsatt mangler ingredienser, så den ikke overskriver noe husstanden har skrevet.
create function middag.agent_fyll_oppskrift(nokkel text, oid uuid, ingredienser text[], minutter integer, porsjoner integer, fremgangsmaate text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privat.riktig_agentnokkel(nokkel) then
    raise exception 'Ikke tilgang';
  end if;
  update middag.oppskrifter o set
    ingredienser = $3,
    minutter = coalesce(o.minutter, $4),
    porsjoner = coalesce(o.porsjoner, $5),
    fremgangsmaate = case when o.fremgangsmaate = '' then coalesce($6, '') else o.fremgangsmaate end,
    trenger_utfylling = cardinality($3) = 0,
    updated_at = now()
  where o.id = $2 and o.trenger_utfylling;
  return found;
end;
$$;

revoke execute on function middag.agent_utfylling(text) from public;
revoke execute on function middag.agent_fyll_oppskrift(text, uuid, text[], integer, integer, text) from public;
grant execute on function middag.agent_utfylling(text) to anon, authenticated;
grant execute on function middag.agent_fyll_oppskrift(text, uuid, text[], integer, integer, text) to anon, authenticated;
