import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { raspunde } from "@/lib/agent";
import { numerePermise, semnaturaValida, trimiteText } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Verificarea webhook-ului: Meta trimite o provocare, iar noi o întoarcem doar dacă token-ul se potrivește. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Interzis", { status: 403 });
}

interface MesajMeta {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
}

/** Mesaje primite de la WhatsApp. Răspundem mereu 200 după procesare, ca Meta să nu retrimită la nesfârșit. */
export async function POST(request: Request) {
  const corpBrut = await request.text();
  if (!semnaturaValida(corpBrut, request.headers.get("x-hub-signature-256"))) {
    return new Response("Semnătură invalidă", { status: 401 });
  }

  let date: { entry?: { changes?: { value?: { messages?: MesajMeta[] } }[] }[] };
  try {
    date = JSON.parse(corpBrut);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const permise = numerePermise();
  const mesaje = (date.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));

  for (const mesaj of mesaje) {
    try {
      const nume = permise[mesaj.from];
      if (!nume) continue; // număr necunoscut: ignorat, fără niciun răspuns

      // Fiecare mesaj se procesează o singură dată, chiar dacă Meta îl retrimite.
      const { error } = await db().from("agent_mesaje_procesate").insert({ id: mesaj.id });
      if (error) continue;

      if (mesaj.type !== "text" || !mesaj.text?.body) {
        await trimiteText(mesaj.from, "Pentru moment înțeleg doar mesaje scrise.");
        continue;
      }

      const raspuns = await raspunde(mesaj.from, nume, mesaj.text.body);
      const rezultat = await trimiteText(mesaj.from, raspuns);
      if (!rezultat.ok) console.error("Nu am putut trimite răspunsul:", rezultat.eroare);
    } catch (e) {
      console.error("Eroare la procesarea mesajului:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
