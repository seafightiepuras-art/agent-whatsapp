import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formateazaLocal } from "@/lib/timp";
import { trimiteSablon, trimiteText } from "@/lib/whatsapp";

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

    let rezultat = await trimiteText(m.telefon, `Memento: ${m.titlu}\n${cand}`);

    // Mesajul liber merge doar în 24h de la ultimul mesaj al omului; dincolo de asta trebuie șablon aprobat.
    const sablon = process.env.WHATSAPP_SABLON_MEMENTO;
    if (!rezultat.ok && sablon) rezultat = await trimiteSablon(m.telefon, sablon, [m.titlu, cand]);

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
