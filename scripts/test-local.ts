// Test local, fără WhatsApp: conversații scurte direct cu agentul, apoi curăță ce a creat.
// Rulare: npx tsx --conditions react-server scripts/test-local.ts
process.loadEnvFile(".env.local");

const SCENARII: { titlu: string; mesaje: string[] }[] = [
  { titlu: "Conversația din captură", mesaje: ["Poți să-mi reamintești ceva și peste câteva minute?", "peste 5 minute sa iau o pastila", "Doar cu 5 minute"] },
  { titlu: "Programare", mesaje: ["Mâine la 10 am dentist", "Mută-l la 11", "Ce programări am?", "Anulează-l"] },
  { titlu: "Reamintire fără oră", mesaje: ["Mâine dimineață să iau pâine"] },
  { titlu: "Cerere specială", mesaje: ["Vineri la 15:00 am ședință, amintește-mi cu 2 ore înainte și joi seara la 21"] },
];

async function main() {
  const { raspunde } = await import("../src/lib/agent");
  const { db } = await import("../src/lib/db");
  const supabase = db();
  for (const [i, sc] of SCENARII.entries()) {
    const telefon = `4070000000${i}`; // numere fictive
    console.log(`\n=== ${sc.titlu} ===`);
    for (const m of sc.mesaje) {
      console.log("> " + m);
      console.log("< " + (await raspunde(telefon, "Test", m)));
    }
    const { data } = await supabase.from("agent_memento").select("titlu, eveniment_la, status, agent_notificari(trimite_la)").eq("telefon", telefon);
    console.log("[în baza de date]", JSON.stringify(data));
    await supabase.from("agent_memento").delete().eq("telefon", telefon);
    await supabase.from("agent_istoric").delete().eq("telefon", telefon);
  }
  console.log("\n(curățat)");
}
main().catch((e) => { console.error("EROARE:", e); process.exit(1); });
