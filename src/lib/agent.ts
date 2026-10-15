import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { acumLocal } from "@/lib/timp";
import { listeazaMemento, salveazaMemento, stergeMemento } from "@/lib/memento";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_RUNDE = 5;
const ISTORIC_MESAJE = 8;
const ISTORIC_ORE = 3;

const UNELTE: Anthropic.Messages.Tool[] = [
  {
    name: "salveaza_memento",
    description:
      "Salvează o programare și programează notificările de reamintire. Toate datele sunt ora României, format AAAA-LL-ZZTHH:MM (fără fus orar).",
    input_schema: {
      type: "object",
      properties: {
        titlu: { type: "string", description: "Ce este programarea, scurt (ex. 'Dentist')." },
        eveniment_la: { type: "string", description: "Când are loc, ex. 2026-10-16T10:00." },
        notificari_la: {
          type: "array",
          items: { type: "string" },
          description: "Momentele în care omul e anunțat, ex. ['2026-10-15T20:00','2026-10-16T09:00'].",
        },
      },
      required: ["titlu", "eveniment_la", "notificari_la"],
    },
  },
  {
    name: "listeaza_memento",
    description: "Arată programările viitoare ale omului, cu id-ul fiecăreia.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "sterge_memento",
    description: "Anulează o programare după id (luat din listeaza_memento).",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];

function prompt(nume: string): string {
  return `Ești asistentul de memento-uri al lui ${nume}, pe WhatsApp. Vorbești în română, scurt și prietenos: mesaje de 1-3 rânduri, fără formatare complicată.
Acum este: ${acumLocal()}.

Poți: să salvezi programări (salveaza_memento), să le arăți (listeaza_memento) și să le anulezi (sterge_memento).

Reguli:
- Folosești mereu ora României. În unelte, datele sunt AAAA-LL-ZZTHH:MM, fără fus orar.
- Dacă lipsește ceva esențial (ziua sau ora), întrebi o singură dată, scurt. Nu inventa ora.
- Notificări implicite, dacă omul nu cere altfel: seara dinainte la 20:00 și cu o oră înainte de programare. Dacă programarea e azi, doar cu o oră înainte (sau cu 15 minute înainte, dacă nu mai e timp pentru o oră).
- Dacă omul cere ceva anume ("amintește-mi cu 2 ore înainte", "și dimineața la 8"), faci exact asta, în loc de varianta implicită.
- După ce salvezi, confirmi clar: ce, când și când îl anunți. Spui DOAR notificările din câmpul "notificari" al rezultatului uneltei, exact cu zilele și orele de acolo, nu inventa altele. Dacă "notificari_omise" e mai mare ca 0, spune pe scurt că o reamintire a fost sărită fiindcă momentul ei trecuse deja (de exemplu "seara dinainte" când programarea e mâine dimineață și e deja după ora 20:00).
- La "ce programări am?" folosești listeaza_memento. La "anulează X" listezi întâi ca să afli id-ul, apoi ștergi; dacă pot fi mai multe, întrebi care.
- Nu discuți alte subiecte. Dacă ți se cere altceva, spui politicos că te ocupi doar de memento-uri.`;
}

async function executa(telefon: string, nume: string, intrare: Record<string, unknown>): Promise<unknown> {
  switch (nume) {
    case "salveaza_memento":
      return salveazaMemento(
        telefon,
        String(intrare.titlu ?? ""),
        String(intrare.eveniment_la ?? ""),
        Array.isArray(intrare.notificari_la) ? intrare.notificari_la.map(String) : []
      );
    case "listeaza_memento":
      return listeazaMemento(telefon);
    case "sterge_memento":
      return stergeMemento(telefon, String(intrare.id ?? ""));
    default:
      return { eroare: "Unealtă necunoscută." };
  }
}

async function incarcaIstoric(telefon: string): Promise<Anthropic.Messages.MessageParam[]> {
  const de = new Date(Date.now() - ISTORIC_ORE * 3600_000).toISOString();
  const { data } = await db()
    .from("agent_istoric")
    .select("rol, text")
    .eq("telefon", telefon)
    .gte("creat_la", de)
    .order("creat_la", { ascending: false })
    .limit(ISTORIC_MESAJE);
  return (data ?? []).reverse().map((m) => ({ role: m.rol as "user" | "assistant", content: m.text }));
}

async function salveazaIstoric(telefon: string, rol: "user" | "assistant", text: string) {
  await db().from("agent_istoric").insert({ telefon, rol, text });
}

/** Primește mesajul unui om și întoarce răspunsul agentului. Fiecare om vede doar programările lui. */
export async function raspunde(telefon: string, nume: string, mesaj: string): Promise<string> {
  const client = new Anthropic();
  const istoric = await incarcaIstoric(telefon);
  const mesaje: Anthropic.Messages.MessageParam[] = [...istoric, { role: "user", content: mesaj }];
  await salveazaIstoric(telefon, "user", mesaj);

  let raspuns = "";
  for (let runda = 0; runda < MAX_RUNDE; runda++) {
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: prompt(nume),
      tools: UNELTE,
      messages: mesaje,
    });

    const text = r.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const cereri = r.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    if (cereri.length === 0) {
      raspuns = text;
      break;
    }

    mesaje.push({ role: "assistant", content: r.content });
    const rezultate: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const c of cereri) {
      const rezultat = await executa(telefon, c.name, (c.input ?? {}) as Record<string, unknown>);
      rezultate.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(rezultat) });
    }
    mesaje.push({ role: "user", content: rezultate });
  }

  if (!raspuns) raspuns = "Scuze, nu am reușit să înțeleg. Poți scrie din nou, cu ziua și ora?";
  // WhatsApp îngroașe textul cu un singur asterisc (*text*), nu cu două ca Markdown.
  raspuns = raspuns.replace(/\*\*(.+?)\*\*/g, "*$1*");
  await salveazaIstoric(telefon, "assistant", raspuns);
  return raspuns;
}
