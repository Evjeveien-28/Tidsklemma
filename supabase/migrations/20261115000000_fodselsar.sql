-- Fødselsår på personene i husstanden, felles for alle delene. Middag bruker det til porsjoner.
-- «Hvem spiser» og «mat vi ikke liker» flyttes ut av middag-innstillingene.

alter table public.household_people
  add column fodselsar smallint check (fodselsar between 1900 and 2100);

alter table middag.innstillinger
  drop column voksne,
  drop column barn_alder,
  drop column unngaa;
