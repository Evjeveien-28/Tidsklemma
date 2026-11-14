-- Handleliste: felles liste for husstanden, med anslått pris fra Oda. Middag kan sende varer hit.

create schema handleliste;
grant usage on schema handleliste to authenticated;

create table handleliste.varer (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Navnet på varen, f.eks. «brød». Antallet står for seg.
  navn text not null check (length(trim(navn)) between 1 and 120),
  antall numeric(8, 2) not null default 1 check (antall > 0 and antall <= 999),
  -- Butikk-koden (KIWI, ODA_NO …) når varen skal kjøpes et bestemt sted.
  butikk text check (length(butikk) <= 40),
  -- Varen hos Oda som prisen er anslått fra: { id, navn, pris, kilopris, enhet, bilde, forpris }. Null uten treff.
  produkt jsonb,
  -- Skrudd av: ingen pris for denne varen.
  uten_pris boolean not null default false,
  -- «middag» når varen kom fra middagsmenyen, med uka den gjelder.
  kilde text check (kilde in ('middag')),
  kilde_uke date,
  avkrysset_at timestamptz,
  avkrysset_av uuid references auth.users (id) on delete set null,
  lagt_til_av uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index on handleliste.varer (household_id, avkrysset_at);

alter table handleliste.varer enable row level security;
grant select, insert, update, delete on handleliste.varer to authenticated;

create policy "Medlemmer ser varer" on handleliste.varer for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer legger til varer" on handleliste.varer for insert to authenticated
  with check (public.is_household_member(household_id));
create policy "Medlemmer endrer varer" on handleliste.varer for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Medlemmer sletter varer" on handleliste.varer for delete to authenticated
  using (public.is_household_member(household_id));
