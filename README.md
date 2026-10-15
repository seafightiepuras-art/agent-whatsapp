# Agent WhatsApp de memento-uri

Îi scrii pe WhatsApp („mâine la 10 programare la dentist”), el salvează programarea și te anunță la momentele potrivite
(implicit seara dinainte la 20:00 și cu o oră înainte). Fiecare număr permis vede doar programările lui.

## Cum e făcut

- `POST /api/whatsapp` — primește mesajele de la Meta (semnătura e verificată), cere răspunsul agentului (Claude Haiku cu unelte
  `salveaza_memento` / `listeaza_memento` / `sterge_memento`) și îl trimite înapoi. Doar numerele din `NUMERE_PERMISE` primesc răspuns.
- `GET/POST /api/cron/memento` — se apelează în fiecare minut, cu `Authorization: Bearer CRON_SECRET`, și trimite notificările scadente.
- Tabelele `agent_*` din Supabase (vezi `supabase/0001_agent_memento.sql`), fără politici RLS: le folosește doar serverul.

## Punerea în funcțiune

1. **Supabase:** rulează `supabase/0001_agent_memento.sql` în SQL Editor.
2. **Variabile:** copiază `.env.example` ca `.env.local` și completează. Aceleași variabile se pun și în Vercel (Settings > Environment Variables).
3. **Vercel:** proiect nou, legat de repository-ul acestui folder.
4. **Meta (developers.facebook.com) > aplicația > WhatsApp > Configuration:**
   - Callback URL: `https://<domeniul-tau>.vercel.app/api/whatsapp`
   - Verify token: exact valoarea din `WHATSAPP_VERIFY_TOKEN`
   - Abonează-te la câmpul `messages`.
5. **Notificările la minut:** în Supabase, activează extensiile `pg_cron` și `pg_net`, apoi:

   ```sql
   select cron.schedule('agent-memento', '* * * * *', $$
     select net.http_get(
       url := 'https://<domeniul-tau>.vercel.app/api/cron/memento',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     );
   $$);
   ```

## Limite de știut

- Mesajele libere ale agentului merg doar în 24h de la ultimul tău mesaj. Pentru memento-uri trimise mai târziu e nevoie de un
  **șablon aprobat de Meta** (nume în `WHATSAPP_SABLON_MEMENTO`, corp: `Memento: {{1}} — {{2}}`, limba română).
- Token-ul temporar din API Setup expiră în ~24h: pentru folosire continuă se generează unul permanent (System User).
- Apelul telefonic dacă nu răspunzi (Twilio) nu e făcut încă.
