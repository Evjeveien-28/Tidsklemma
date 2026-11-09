"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@hjem/db/server";

/** Sender en engangskode på e-post. Koden skrives inn i appen, så det virker også når e-postprogrammet åpner lenker på forhånd. */
export async function loggInn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/logg-inn?feil=1");

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Nye brukere opprettes bare hvis e-posten er invitert (sjekkes av hook_bare_inviterte i Supabase).
    // Lenken brukes bare hvis e-postmalen fortsatt har en lenke.
    options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/bekreft` },
  });
  const epost = encodeURIComponent(email);
  if (error) redirect(error.status === 429 ? `/logg-inn?kode=1&epost=${epost}&feil=vent` : "/logg-inn?feil=1");
  redirect(`/logg-inn?kode=1&epost=${epost}`);
}

export async function bekreftKode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const kode = String(formData.get("kode") ?? "").replace(/\D/g, "");
  const tilbake = `/logg-inn?kode=1&epost=${encodeURIComponent(email)}`;
  if (!email || kode.length < 6) redirect(`${tilbake}&feil=kode`);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: kode, type: "email" });
  if (error) redirect(`${tilbake}&feil=kode`);
  redirect("/");
}

export async function loggUt() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/logg-inn");
}
