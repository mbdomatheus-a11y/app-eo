import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const url = Deno.env.get("SUPABASE_URL")!;
const publishableKey = JSON.parse(
  Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!,
).default;
const secretKey = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!).default;
const anonKey = publishableKey as string;
const serviceKey = secretKey as string;
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return json({ error: "Método não permitido." }, 405);

  const origin = req.headers.get("origin");
  const appUrl = Deno.env.get("APP_URL");
  if (!appUrl || origin !== appUrl)
    return json({ error: "Origem não autorizada." }, 403);

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ error: "Sessão necessária." }, 401);
  const caller = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: authData, error: authError } =
    await caller.auth.getUser(bearer);
  if (authError || !authData.user)
    return json({ error: "Sessão inválida." }, 401);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }
  const action = input.action;
  const callerId = authData.user.id;

  if (action === "change-temporary-password") {
    const password = String(input.password ?? "");
    if (password.length < 12 || password.length > 128) {
      return json({ error: "Use uma senha entre 12 e 128 caracteres." }, 400);
    }
    const { data: profile } = await admin
      .from("eo_profiles")
      .select("must_change_password,active")
      .eq("id", callerId)
      .maybeSingle();
    if (!profile?.active || !profile.must_change_password) {
      return json({ error: "Este fluxo não está ativo para a conta." }, 403);
    }
    const { data: identity } = await admin
      .from("eo_profiles")
      .select("login_chapa")
      .eq("id", callerId)
      .maybeSingle();
    if (!identity?.login_chapa)
      return json({ error: "Chapa ainda não vinculada à conta." }, 403);
    const alias = `app-${identity.login_chapa}@login.app-eo.invalid`;
    const { error: flagError } = await admin
      .from("eo_profiles")
      .update({ must_change_password: true })
      .eq("id", callerId);
    if (flagError)
      return json(
        { error: "Não foi possível ativar a troca obrigatória." },
        503,
      );
    const { error: passwordError } = await admin.auth.admin.updateUserById(
      callerId,
      {
        email: alias,
        email_confirm: true,
        password,
      },
    );
    if (passwordError)
      return json({ error: "Não foi possível atualizar a senha." }, 400);
    const { error: updateError } = await admin
      .from("eo_profiles")
      .update({ must_change_password: false })
      .eq("id", callerId);
    if (updateError)
      return json(
        {
          error: "Senha atualizada. Entre novamente para concluir a liberação.",
        },
        503,
      );
    await admin.from("eo_audit_events").insert({
      actor: callerId,
      action: "identity.temporary_password_changed",
      entity_id: callerId,
    });
    return json({ ok: true });
  }

  const { data: profile, error: profileError } = await admin
    .from("eo_profiles")
    .select("role,active,master_admin,must_change_password")
    .eq("id", callerId)
    .maybeSingle();
  if (
    profileError ||
    !profile?.active ||
    profile.role !== "admin" ||
    profile.must_change_password
  ) {
    return json({ error: "Ação não autorizada." }, 403);
  }

  if (action === "issue-master-temporary-password") {
    if (!profile.master_admin || input.user_id !== callerId)
      return json({ error: "Ação restrita ao administrador master." }, 403);
    const alphabet =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const password = Array.from(
      bytes,
      (byte) => alphabet[byte % alphabet.length],
    ).join("");
    const { data: identity } = await admin
      .from("eo_profiles")
      .select("login_chapa")
      .eq("id", callerId)
      .maybeSingle();
    if (!identity?.login_chapa)
      return json({ error: "Chapa ainda não vinculada à conta." }, 403);
    const alias = `app-${identity.login_chapa}@login.app-eo.invalid`;
    const { error: passwordError } = await admin.auth.admin.updateUserById(
      callerId,
      {
        email: alias,
        email_confirm: true,
        password,
      },
    );
    if (passwordError) {
      await admin
        .from("eo_profiles")
        .update({ must_change_password: false })
        .eq("id", callerId);
      return json(
        { error: "Não foi possível preparar a senha temporária." },
        400,
      );
    }
    await admin.from("eo_audit_events").insert({
      actor: callerId,
      action: "identity.master_temporary_password_issued",
      entity_id: callerId,
    });
    return json({ password });
  }

  if (action === "invite-person") {
    const email = String(input.email ?? "")
      .trim()
      .toLowerCase();
    const name = String(input.name ?? "").trim();
    const chapa = String(input.chapa ?? "").trim();
    const role = String(input.role ?? "");
    const stores = Array.isArray(input.stores) ? input.stores.map(String) : [];
    if (
      !/^\S+@\S+\.\S+$/.test(email) ||
      name.length < 2 ||
      name.length > 120 ||
      !/^\d{1,20}$/.test(chapa)
    ) {
      return json({ error: "Confira nome, e-mail e chapa." }, 400);
    }
    if (!["colaborador", "gerente", "diretor", "admin"].includes(role))
      return json({ error: "Perfil inválido." }, 400);
    if (["diretor", "admin"].includes(role) && !profile.master_admin)
      return json(
        { error: "Somente o administrador master pode conceder esse perfil." },
        403,
      );
    if (role !== "admin" && !stores.length)
      return json({ error: "Selecione ao menos uma loja." }, 400);
    if (stores.some((store) => !/^[0-9a-f-]{36}$/i.test(store)))
      return json({ error: "Lista de lojas inválida." }, 400);

    const redirectTo = `${appUrl}/?set-password=1`;
    const [
      { data: existingChapa, error: chapaError },
      { data: existingEmail, error: emailError },
    ] = await Promise.all([
      admin.from("eo_profiles").select("id").eq("login_chapa", chapa).limit(1),
      admin
        .from("eo_profiles")
        .select("id")
        .eq("contact_email", email)
        .limit(1),
    ]);
    if (chapaError || emailError)
      return json({ error: "Não foi possível validar o cadastro." }, 503);
    if (existingChapa?.length || existingEmail?.length)
      return json({ error: "Chapa ou e-mail já cadastrado." }, 409);
    const { data: knownStores, error: storeLookupError } = await admin
      .from("eo_stores")
      .select("id")
      .eq("active", true)
      .in("id", stores);
    if (
      storeLookupError ||
      (role !== "admin" && knownStores?.length !== new Set(stores).size)
    ) {
      return json({ error: "Confira as lojas selecionadas." }, 400);
    }

    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: { display_name: name, login_chapa: chapa },
        redirectTo,
      });
    const invited = inviteData.user;
    if (inviteError || !invited)
      return json(
        {
          error:
            "Não foi possível enviar o convite. Confira o SMTP e se o e-mail já tem conta.",
        },
        400,
      );

    const { error: upsertError } = await admin.from("eo_profiles").upsert({
      id: invited.id,
      display_name: name,
      role,
      login_chapa: chapa,
      contact_email: email,
      active: true,
      must_change_password: true,
    });
    if (upsertError) {
      return json(
        {
          error:
            "A conta recebeu convite, mas o vínculo ficou pendente. Peça revisão à administração técnica.",
        },
        409,
      );
    }
    await admin.from("eo_store_members").delete().eq("user_id", invited.id);
    if (stores.length) {
      const { error: storesError } = await admin
        .from("eo_store_members")
        .insert(
          [...new Set(stores)].map((store_id) => ({
            user_id: invited.id,
            store_id,
          })),
        );
      if (storesError) {
        return json(
          {
            error:
              "Conta criada, mas não foi possível vincular as lojas. O acesso permanece bloqueado até revisão.",
          },
          400,
        );
      }
    }
    await admin.from("eo_audit_events").insert({
      actor: callerId,
      action: "member.invited",
      entity_id: invited.id,
      detail: { role, store_count: stores.length },
    });
    return json({ ok: true });
  }

  return json({ error: "Ação desconhecida." }, 400);
});
