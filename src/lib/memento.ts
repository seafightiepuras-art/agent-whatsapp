import "server-only";
import { db } from "@/lib/db";
import { formateazaLocal, localLaUtc } from "@/lib/timp";

export interface MementoSalvat {
  id: string;
  titlu: string;
  eveniment: string;
  notificari: string[];
  /** Câte notificări cerute au fost sărite fiindcă momentul lor trecuse deja sau cădea după programare. */
  notificari_omise: number;
}

/** Salvează o programare și notificările ei. Datele vin ca oră locală a României. */
export async function salveazaMemento(
  telefon: string,
  titlu: string,
  evenimentLocal: string,
  notificariLocale: string[]
): Promise<{ ok: true; memento: MementoSalvat } | { ok: false; eroare: string }> {
  const eveniment = localLaUtc(evenimentLocal);
  if (!titlu.trim()) return { ok: false, eroare: "Lipsește titlul." };
  if (!eveniment) return { ok: false, eroare: "Data programării nu e validă (format AAAA-LL-ZZTHH:MM)." };
  if (eveniment.getTime() < Date.now()) return { ok: false, eroare: "Data programării e în trecut." };

  // Notificările în trecut sau după eveniment nu au sens: le ignorăm.
  const acum = Date.now();
  const cerute = [...new Set(notificariLocale)];
  const notificari = cerute
    .map((l) => localLaUtc(l))
    .filter((d): d is Date => d !== null && d.getTime() > acum && d.getTime() <= eveniment.getTime());
  const omise = cerute.length - notificari.length;
  if (notificari.length === 0) {
    return { ok: false, eroare: "Nicio notificare rămâne în viitor înainte de programare. Ce moment de reamintire vrei?" };
  }

  const supabase = db();
  const { data: memento, error } = await supabase
    .from("agent_memento")
    .insert({ telefon, titlu: titlu.trim(), eveniment_la: eveniment.toISOString() })
    .select("id")
    .single();
  if (error || !memento) return { ok: false, eroare: "Nu am putut salva: " + (error?.message ?? "eroare necunoscută") };

  const { error: eroareNotif } = await supabase
    .from("agent_notificari")
    .insert(notificari.map((d) => ({ memento_id: memento.id, trimite_la: d.toISOString() })));
  if (eroareNotif) {
    await supabase.from("agent_memento").delete().eq("id", memento.id);
    return { ok: false, eroare: "Nu am putut salva notificările: " + eroareNotif.message };
  }

  return {
    ok: true,
    memento: {
      id: memento.id,
      titlu: titlu.trim(),
      eveniment: formateazaLocal(eveniment),
      notificari: notificari.map((d) => formateazaLocal(d)),
      notificari_omise: omise,
    },
  };
}

/** Programările viitoare ale unei persoane, cu notificările care urmează. */
export async function listeazaMemento(telefon: string) {
  const supabase = db();
  const { data, error } = await supabase
    .from("agent_memento")
    .select("id, titlu, eveniment_la, agent_notificari(trimite_la, trimis_la)")
    .eq("telefon", telefon)
    .eq("status", "activ")
    .gte("eveniment_la", new Date().toISOString())
    .order("eveniment_la");
  if (error) return { eroare: error.message };
  return {
    memento: (data ?? []).map((m) => ({
      id: m.id,
      titlu: m.titlu,
      eveniment: formateazaLocal(m.eveniment_la),
      notificari_ramase: (m.agent_notificari ?? [])
        .filter((n) => !n.trimis_la)
        .map((n) => formateazaLocal(n.trimite_la)),
    })),
  };
}

/** Anulează o programare — doar dacă e a persoanei care cere. */
export async function stergeMemento(telefon: string, id: string): Promise<{ ok: boolean; eroare?: string }> {
  const supabase = db();
  const { data, error } = await supabase
    .from("agent_memento")
    .update({ status: "anulat" })
    .eq("id", id)
    .eq("telefon", telefon)
    .select("id");
  if (error) return { ok: false, eroare: error.message };
  if (!data?.length) return { ok: false, eroare: "Nu am găsit programarea asta." };
  // Notificările rămase nu se mai trimit: cron-ul ignoră programările anulate.
  return { ok: true };
}
