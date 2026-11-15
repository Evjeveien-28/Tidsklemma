-- Middag: grenser i databasen, så ikke noe kan sendes inn utenom appen som er for stort eller rart.
-- «not valid»: gjelder nye og endrede rader, uten å stoppe på det som finnes fra før.

-- En bestilling har 1–7 dager.
alter table middag.bestillinger
  add constraint dager_antall check (jsonb_array_length(dager) between 1 and 7) not valid;

-- Valgene i en meny (rett per dag, har hjemme, butikker) er små.
alter table middag.menyer
  add constraint valg_storrelse check (pg_column_size(valg) <= 20000) not valid;

-- Bilder fra oppskriftssider er vanlige nettadresser.
alter table middag.oppskrifter
  add constraint bilde_url_nett check (bilde_url ~ '^https?://') not valid;
