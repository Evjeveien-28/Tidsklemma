-- Middag: hvem som har sett den nyeste menyen, for den røde prikken på Middag-flisen.
-- En meny som lages på nytt for samme uke beholder id-en, så vi sammenligner tidspunktet med laget_at.

create table middag.sett (
  meny_id uuid not null references middag.menyer (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sett_at timestamptz not null default now(),
  primary key (meny_id, user_id)
);

alter table middag.sett enable row level security;
grant select, insert, update on middag.sett to authenticated;

create policy "Egne sett-merker" on middag.sett for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from middag.menyer m where m.id = meny_id and public.is_household_member(m.household_id))
  );
