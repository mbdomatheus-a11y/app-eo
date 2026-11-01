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
  const origin = req.headers.get("origin");
  const appUrl = Deno.env.get("APP_URL");
  if (!appUrl) return json({ error: "Origem do aplicativo não configurada." }, 503);
  if (origin && origin !== appUrl) return json({ error: "Origem não autorizada." }, 403);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ error: "Sessão necessária." }, 401);
  const caller = createClient(url, publishableKey, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: userData, error: userError } = await caller.auth.getUser(bearer);
  if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);
  let alertId: string;
  try {
    const body = await req.json();
    if (typeof body?.alert_id !== "string") return json({ error: "Alerta inválido." }, 400);
    alertId = body.alert_id;
  } catch { return json({ error: "Requisição inválida." }, 400); }
  const { data: alert, error: alertError } = await caller.rpc("eo_alert_push_metadata", { p_alert: alertId });
  if (alertError || !alert) return json({ error: "Alerta não autorizado." }, 403);

  const recipientIds: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from("eo_alert_recipients").select("user_id")
      .eq("alert_id", alertId).order("user_id").range(offset, offset + 999);
    if (error) return json({ error: "Não foi possível preparar os destinatários." }, 500);
    recipientIds.push(...(data ?? []).map((row) => row.user_id as string));
    if ((data?.length ?? 0) < 1000) break;
  }
  const devices: { user_id: string; expo_push_token: string }[] = [];
  for (let offset = 0; offset < recipientIds.length; offset += 500) {
    const ids = recipientIds.slice(offset, offset + 500);
    for (let page = 0; ; page += 1) {
      const { data, error } = await admin.from("eo_push_devices").select("user_id,expo_push_token")
        .in("user_id", ids).range(page * 1000, page * 1000 + 999);
      if (error) return json({ error: "Não foi possível localizar os dispositivos registrados." }, 500);
      devices.push(...(data ?? []).map((row) => ({ user_id: row.user_id as string, expo_push_token: row.expo_push_token as string })));
      if ((data?.length ?? 0) < 1000) break;
    }
  }
  const soundPreferences = new Map<string, boolean>();
  for (let offset = 0; offset < recipientIds.length; offset += 500) {
    const { data, error } = await admin.from("eo_notification_settings").select("user_id,sound_enabled")
      .in("user_id", recipientIds.slice(offset, offset + 500));
    if (error) return json({ error: "Não foi possível carregar as preferências de notificação." }, 500);
    for (const setting of data ?? []) soundPreferences.set(setting.user_id as string, setting.sound_enabled as boolean);
  }
  const messages = devices.map((device) => {
    const soundEnabled = soundPreferences.get(device.user_id) ?? true;
    return {
      to: device.expo_push_token, title: alert.title, body: alert.body,
      sound: soundEnabled ? "default" : null, priority: alert.urgent ? "high" : "default",
      channelId: soundEnabled ? "eo-alerts" : "eo-alerts-quiet", data: { type: "eo-alert", alertId },
    };
  });
  let accepted = 0;
  for (let offset = 0; offset < messages.length; offset += 500) {
    const batches = Array.from({ length: Math.ceil(Math.min(500, messages.length - offset) / 100) }, (_, index) => messages.slice(offset + index * 100, offset + (index + 1) * 100));
    const responses = await Promise.all(batches.map((batch) => fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: { Accept: "application/json", "Accept-encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    })));
    for (const response of responses) {
      if (!response.ok) return json({ error: "O serviço de push não aceitou a entrega." }, 502);
      const result = await response.json();
      accepted += (result.data ?? []).filter((ticket: { status?: string }) => ticket.status === "ok").length;
    }
  }
  return json({ accepted, devices: devices.length, note: "Aceitação pelo Expo não garante entrega ao aparelho." });
});
