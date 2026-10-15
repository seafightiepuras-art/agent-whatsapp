// Test local, fără WhatsApp: trimite câteva mesaje direct agentului și afișează răspunsurile,
// apoi șterge ce a creat. Rulare: npx tsx --conditions react-server scripts/test-local.ts
process.loadEnvFile(".env.local");

async function main() {
  const { raspunde } = await import("../src/lib/agent");
  const { db } = await import("../src/lib/db");
  const telefon = "40700000001"; // număr fictiv de test, ca să nu atingem nimic real
  const mesaje = [
    "Mâine la 10 am programare la dentist",
    "Ce programări am?",
    "Anulează dentistul",
    "Ce programări am?",
  ];
  for (const m of mesaje) {
    console.log("\n> " + m);
    console.log("< " + (await raspunde(telefon, "Test", m)));
  }
  const supabase = db();
  await supabase.from("agent_memento").delete().eq("telefon", telefon);
  await supabase.from("agent_istoric").delete().eq("telefon", telefon);
  console.log("\n(curățat: programările și istoricul de test au fost șterse)");
}
main().catch((e) => { console.error("EROARE:", e); process.exit(1); });
