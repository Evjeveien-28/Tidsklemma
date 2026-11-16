-- Handleliste: egne butikker husstanden har lagt til, f.eks. «Clas Ohlson». Brukes bare i Handleliste, ikke i Middag.
-- Varene lagrer butikkens navn i handleliste.varer.butikk; denne tabellen husker navnene til nedtrekkslisten.

create table handleliste.butikker (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  navn text not null check (length(trim(navn)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (household_id, navn)
);

alter table handleliste.butikker enable row level security;
grant select, insert, delete on handleliste.butikker to authenticated;

create policy "Medlemmer ser butikker" on handleliste.butikker for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer legger til butikker" on handleliste.butikker for insert to authenticated
  with check (public.is_household_member(household_id));
create policy "Medlemmer sletter butikker" on handleliste.butikker for delete to authenticated
  using (public.is_household_member(household_id));
