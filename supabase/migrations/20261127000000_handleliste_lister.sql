-- Handleliste: flere lister. Matlisten er standard og finnes alltid: varer uten liste_id står på den, og det er dit
-- Middag sender. Andre lister (f.eks. «Jul» eller «Hytta») lagres her, og varene deres har liste_id.

create table handleliste.lister (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  navn text not null check (length(trim(navn)) between 1 and 40),
  created_at timestamptz not null default now()
);

create index on handleliste.lister (household_id);

alter table handleliste.lister enable row level security;
grant select, insert, update, delete on handleliste.lister to authenticated;

create policy "Medlemmer ser lister" on handleliste.lister for select to authenticated
  using (public.is_household_member(household_id));
create policy "Medlemmer lager lister" on handleliste.lister for insert to authenticated
  with check (public.is_household_member(household_id));
create policy "Medlemmer endrer lister" on handleliste.lister for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "Medlemmer sletter lister" on handleliste.lister for delete to authenticated
  using (public.is_household_member(household_id));

-- Null = matlisten. Slettes en liste, forsvinner varene på den.
alter table handleliste.varer add column liste_id uuid references handleliste.lister (id) on delete cascade;
create index on handleliste.varer (household_id, liste_id);
