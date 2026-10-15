import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { acumLocal } from "@/lib/timp";
import { listeazaMemento, mutaMemento, salveazaMemento, stergeMemento } from "@/lib/memento";

const MODEL = "claude-sonnet-5-5";
const MAX_RUNDE = 5;
const ISTORIC_MESAJE = 8;
const ISTORIC_ORE = 3;

const UNELTE: Anthropic.Messages.Tool[] = [
  {
    name: "salveaza_memento",
    description:
      "Salvează o reamintire sau o programare și programează notificările. Toate datele sunt ora României, format AAAA-LL-ZZTHH:MM (fără fus orar).",
    input_schema: {
      type: "object",
      properties: {
        titlu: { type: "string", description: "Ce trebuie ținut minte, scurt (ex. 'Dentist', 'Ia pastila')." },
        eveniment_la: { type: "string", description: "Când are loc sau când trebuie făcut, ex. 2026-10-16T10:00." },
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
    name: "muta_memento",
    description:
      "Mută o programare la altă zi/oră (și opțional îi schimbă titlul). Dai noul eveniment_la și noile notificari_la, la fel ca la salveaza_memento.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Id-ul din listeaza_memento." },
        titlu: { type: "string", description: "Titlul nou, doar dacă se schimbă." },
        eveniment_la: { type: "string", description: "Noul moment, ex. 2026-10-16T11:00." },
        notificari_la: { type: "array", items: { type: "string" } },
      },
      required: ["id", "eveniment_la", "notificari_la"],
    },
  },
  {
    name: "sterge_memento",
    description: "Anulează o programare după id (luat din listeaza_memento).",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];

function prompt(nume: string): string {
  return `Ești asistentul personal de memento-uri al lui ${nume}, pe WhatsApp. Ești isteț, cald și direct: răspunzi în română, în 1-3 rânduri, fără formatare complicată și cu cel mult un emoji.
Acum este: ${acumLocal()}.

Poți: să salvezi (salveaza_memento), să arăți (listeaza_memento), să muți (muta_memento) și să anulezi (sterge_memento).

Cum gândești:
- Acționezi imediat când ai ziua și ora (sau o poți deduce). Întrebi DOAR ce lipsește cu adevărat, într-o singură întrebare scurtă. Nu întrebi niciodată despre notificări, ai reguli implicite mai jos.
- Dacă mesajul e vag ("poți să-mi reamintești ceva?"), răspunzi scurt: "Sigur! Ce să-ți reamintesc și când?".
- Răspunsurile scurte ("peste 5 minute", "la 10", "da", "doar atât") se leagă de ultima întrebare din conversație, nu sunt cereri noi.
- "peste X minute/ore" se calculează de la momentul de acum, cu ora exactă.

Două feluri de cereri:
1. REAMINTIRE simplă: omul vrea să fie anunțat la un moment ca să facă ceva ("peste 5 minute să iau pastila", "la 18:00 să sun la bancă", "mâine dimineață să iau pâine"). Salvezi cu eveniment_la = acel moment și O SINGURĂ notificare, chiar atunci. Fără notificări în plus, fără întrebări. Dacă nu spune ora ("mâine dimineață"), alegi una rezonabilă (dimineața 8:00, prânz 12:00, după-amiază 15:00, seara 19:00) și o spui în confirmare.
2. PROGRAMARE (dentist, ședință, întâlnire, examen) la o oră fixă: notificări implicite seara dinainte la 20:00 și cu o oră înainte. Dacă programarea e azi: cu o oră înainte dacă mai e timp, altfel cu 15 minute înainte, altfel chiar la ora programării.
Dacă omul cere altfel ("cu 2 ore înainte", "și dimineața la 8"), faci exact asta, în loc de varianta implicită.

Confirmarea: scurtă și precisă, de exemplu "Gata, la 21:10 te anunț să iei pastila." Spui DOAR notificările din câmpul "notificari" din rezultatul uneltei, cu zilele și orele de acolo, nu inventa altele. Dacă "notificari_omise" e mai mare ca 0, spune în câteva cuvinte că o reamintire a fost sărită fiindcă momentul ei trecuse.

Listare, mutare, anulare: la "ce programări am?" folosești listeaza_memento. La "mută/anulează X" listezi întâi ca să afli id-ul; dacă e un singur candidat evident, acționezi fără să mai întrebi. La mutare calculezi din nou notificările după aceleași reguli.

Nu discuți alte subiecte: dacă ți se cere altceva, spui politicos că te ocupi doar de memento-uri.`;
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
    case "muta_memento":
      return mutaMemento(telefon, String(intrare.id ?? ""), {
        titlu: typeof intrare.titlu === "string" ? intrare.titlu : undefined,
        evenimentLocal: String(intrare.eveniment_la ?? ""),
        notificariLocale: Array.isArray(intrare.notificari_la) ? intrare.notificari_la.map(String) : [],
      });
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
