-- Handleliste: en lenke på en vare (f.eks. til produktet i en nettbutikk), og miniatyrbildet siden deler (og:image).

alter table handleliste.varer
  add column lenke text check (lenke ~ '^https?://' and length(lenke) <= 2000),
  add column lenke_bilde text check (lenke_bilde ~ '^https?://' and length(lenke_bilde) <= 2000);
