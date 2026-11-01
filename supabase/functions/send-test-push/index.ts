import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const url = Deno.env.get("SUPABASE_URL")!;
const publishableKey = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!).default as string;
const secretKey = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!).default as string;
const admin = createClient(url, secretKey, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const appUrl = Deno.env.get("APP_URL");
  if (!appUrl) return json({ error: "Origem do aplicativo não configurada." }, 503);
  const origin = req.headers.get("origin");
  if (origin && origin !== appUrl) return json({ error: "Origem não autorizada." }, 403);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ error: "Sessão necessária." }, 401);
  const caller = createClient(url, publishableKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer}` } } });
  const { data: authData, error: authError } = await caller.auth.getUser(bearer);
  if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);
  const { data: scope, error: scopeError } = await caller.rpc("eo_test_push_metadata");
  if (scopeError || scope?.user_id !== authData.user.id) return json({ error: "Somente um administrador ativo pode enviar teste." }, 403);

  const { data: devices, error: deviceError } = await admin.from("eo_push_devices").select("expo_push_token")
    .eq("user_id", authData.user.id);
  if (deviceError) return json({ error: "Não foi possível localizar os dispositivos registrados." }, 500);
  if (!devices?.length) return json({ devices: 0, accepted: 0, note: "Ative notificações em um aparelho antes de enviar o teste." });
  const { data: preference } = await admin.from("eo_notification_settings").select("sound_enabled")
    .eq("user_id", authData.user.id).maybeSingle();
  const soundEnabled = preference?.sound_enabled ?? true;
  const messages = devices.map((device) => ({
    to: device.expo_push_token, title: "Teste de notificações do EO",
    body: "Seu aparelho está conectado para receber alertas operacionais.",
    sound: soundEnabled ? "default" : null, priority: "high",
    channelId: soundEnabled ? "eo-alerts" : "eo-alerts-quiet", data: { type: "eo-test" },
  }));
  let accepted = 0;
  for (let offset = 0; offset < messages.length; offset += 100) {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: { Accept: "application/json", "Accept-encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(messages.slice(offset, offset + 100)),
    });
    if (!response.ok) return json({ error: "O serviço de push não aceitou o teste." }, 502);
    const result = await response.json();
    accepted += (result.data ?? []).filter((ticket: { status?: string }) => ticket.status === "ok").length;
  }
  await admin.from("eo_audit_events").insert({ actor: authData.user.id, action: "notification.test.sent", entity_id: authData.user.id, detail: { devices: devices.length, accepted } });
  return json({ devices: devices.length, accepted, note: "Aceitação pelo Expo não garante entrega ao aparelho." });
});
