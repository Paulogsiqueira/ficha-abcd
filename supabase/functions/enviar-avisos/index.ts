// @ts-nocheck
// Envia o aviso de fim de descanso (Web Push). Chamada pelo pg_cron a cada 5 s, só quando há aviso vencido.
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e CRON_SECRET.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

webpush.setVapidDetails("https://paulogsiqueira.github.io/ficha-abcd/", VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return new Response("proibido", { status: 403 });
  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: avisos, error } = await admin.rpc("pegar_avisos");
  if (error) { console.error("pegar_avisos", error); return new Response("erro", { status: 500 }); }
  let enviados = 0;
  for (const a of avisos || []) {
    const { data: subs } = await admin.from("push_subs").select("endpoint, sub").eq("user_id", a.user_id);
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(s.sub, JSON.stringify({ titulo: a.titulo, corpo: a.corpo, tag: "descanso" }), { TTL: 120, urgency: "high" });
        enviados++;
      } catch (e) {
        console.error("push", e.statusCode, String(e.body || e.message).slice(0, 200));
        if (e.statusCode === 404 || e.statusCode === 410) await admin.from("push_subs").delete().eq("endpoint", s.endpoint);
      }
    }
  }
  if (enviados) console.log("enviados", enviados);
  return new Response(JSON.stringify({ enviados }), { headers: { "Content-Type": "application/json" } });
});
