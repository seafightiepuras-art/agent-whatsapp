import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formateazaLocal } from "@/lib/timp";
import { trimiteSablon, trimiteText, type RezultatTrimitere } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_INCERCARI = 3;

/** Se apelează la fiecare minut (din Supabase pg_cron sau alt serviciu) și trimite notificările ajunse la scadență. */
async function trimiteScadente(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ eroare: "Neautorizat." }, { status: 401 });
  }

  const supabase = db();
  const { data, error } = await supabase
    .from("agent_notificari")
    .select("id, incercari, memento:agent_memento!inner(telefon, titlu, eveniment_la, status)")
    .is("trimis_la", null)
    .lte("trimite_la", new Date().toISOString())
    .lt("incercari", MAX_INCERCARI)
    .eq("memento.status", "activ")
    .limit(50);
  if (error) return NextResponse.json({ eroare: error.message }, { status: 500 });

  let trimise = 0;
  for (const n of data ?? []) {
    const m = n.memento as unknown as { telefon: string; titlu: string; eveniment_la: string };
    const cand = formateazaLocal(m.eveniment_la);

    // Mesajul liber merge doar în 24h de la ultimul mesaj al omului. Meta acceptă și mesajele din afara ferestrei
    // (răspunde 200), dar nu le livrează — de aceea decidem noi, după ultimul mesaj primit, ce trimitem.
    const { data: ultim } = await supabase
      .from("agent_istoric")
      .select("creat_la")
      .eq("telefon", m.telefon)
      .eq("rol", "user")
      .order("creat_la", { ascending: false })
      .limit(1);
    const inFereastra = !!ultim?.[0] && Date.now() - new Date(ultim[0].creat_la).getTime() < 23 * 3600_000;

    const sablon = process.env.WHATSAPP_SABLON_MEMENTO;
    let rezultat: RezultatTrimitere;
    if (inFereastra) {
      rezultat = await trimiteText(m.telefon, `Memento: ${m.titlu}\n${cand}`);
    } else if (sablon) {
      rezultat = await trimiteSablon(m.telefon, sablon, [m.titlu, cand]);
    } else {
      rezultat = { ok: false, eroare: "Fereastra de 24h a expirat și nu e configurat WHATSAPP_SABLON_MEMENTO." };
    }

    if (rezultat.ok) {
      trimise++;
      await supabase.from("agent_notificari").update({ trimis_la: new Date().toISOString() }).eq("id", n.id);
    } else {
      await supabase
        .from("agent_notificari")
        .update({ incercari: n.incercari + 1, ultima_eroare: rezultat.eroare ?? "necunoscută" })
        .eq("id", n.id);
    }
  }

  return NextResponse.json({ verificate: (data ?? []).length, trimise });
}

export const GET = trimiteScadente;
export const POST = trimiteScadente;
