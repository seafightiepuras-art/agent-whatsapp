import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const VERSIUNE_API = "v21.0";

export interface RezultatTrimitere {
  ok: boolean;
  eroare?: string;
  cod?: number;
}

async function trimite(corp: Record<string, unknown>): Promise<RezultatTrimitere> {
  const token = process.env.WHATSAPP_TOKEN;
  const idNumar = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !idNumar) return { ok: false, eroare: "Lipsesc WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID." };

  const r = await fetch(`https://graph.facebook.com/${VERSIUNE_API}/${idNumar}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...corp }),
  });
  if (r.ok) return { ok: true };
  const raspuns = (await r.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
  return { ok: false, eroare: raspuns?.error?.message ?? `HTTP ${r.status}`, cod: raspuns?.error?.code };
}

/** Mesaj text liber — merge doar în 24h de la ultimul mesaj primit de la persoană. */
export function trimiteText(catre: string, text: string): Promise<RezultatTrimitere> {
  return trimite({ to: catre, type: "text", text: { body: text } });
}

/** Șablon aprobat de Meta — singurul tip permis după 24h de la ultimul mesaj al persoanei. */
export function trimiteSablon(catre: string, nume: string, parametri: string[]): Promise<RezultatTrimitere> {
  return trimite({
    to: catre,
    type: "template",
    template: {
      name: nume,
      language: { code: "ro" },
      components: [{ type: "body", parameters: parametri.map((text) => ({ type: "text", text })) }],
    },
  });
}

/** Meta semnează fiecare mesaj primit cu secretul aplicației: verificăm ca să nu accepte nimeni mesaje false. */
export function semnaturaValida(corpBrut: string, antet: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !antet?.startsWith("sha256=")) return false;
  const asteptata = createHmac("sha256", secret).update(corpBrut).digest("hex");
  const primita = antet.slice("sha256=".length);
  if (asteptata.length !== primita.length) return false;
  return timingSafeEqual(Buffer.from(asteptata), Buffer.from(primita));
}

/** Lista permisă din NUMERE_PERMISE: "40724206225=Angel,40700000000=Soția" -> { "40724206225": "Angel", ... } */
export function numerePermise(): Record<string, string> {
  const rezultat: Record<string, string> = {};
  for (const bucata of (process.env.NUMERE_PERMISE ?? "").split(",")) {
    const [numar, ...nume] = bucata.split("=");
    const cifre = numar?.replace(/\D/g, "");
    if (cifre) rezultat[cifre] = nume.join("=").trim() || cifre;
  }
  return rezultat;
}
