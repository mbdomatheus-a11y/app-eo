import { validateOrganizationEmail, unitTypes } from "./policy.ts";
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
function generateTemporaryPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(24)),
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return json({ error: "MÃ©todo nÃ£o permitido." }, 405);

  const origin = req.headers.get("origin");
  const appUrl = Deno.env.get("APP_URL");
  if (!appUrl)
    return json({ error: "Origem do aplicativo nÃ£o configurada." }, 503);
  // Web calls must come from the configured portal. Native clients may omit
  // Origin; their access is still gated by the validated Supabase session and
  // the active admin profile checks below.
  if (origin && origin !== appUrl)
    return json({ error: "Origem nÃ£o autorizada." }, 403);

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ error: "SessÃ£o necessÃ¡ria." }, 401);
  const caller = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: authData, error: authError } =
    await caller.auth.getUser(bearer);
  if (authError || !authData.user)
    return json({ error: "SessÃ£o invÃ¡lida." }, 401);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "RequisiÃ§Ã£o invÃ¡lida." }, 400);
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
      return json({ error: "Este fluxo nÃ£o estÃ¡ ativo para a conta." }, 403);
    }
    const { data: identity } = await admin
      .from("eo_profiles")
      .select("login_chapa")
      .eq("id", callerId)
      .maybeSingle();
    if (!identity?.login_chapa)
      return json({ error: "Chapa ainda nÃ£o vinculada Ã  conta." }, 403);
    const alias = `app-${identity.login_chapa}@login.app-eo.invalid`;
    const { error: flagError } = await admin
      .from("eo_profiles")
      .update({ must_change_password: true })
      .eq("id", callerId);
    if (flagError)
      return json(
        { error: "NÃ£o foi possÃ­vel ativar a troca obrigatÃ³ria." },
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
      return json({ error: "NÃ£o foi possÃ­vel atualizar a senha." }, 400);
    const { error: updateError } = await admin
      .from("eo_profiles")
      .update({ must_change_password: false })
      .eq("id", callerId);
    if (updateError)
      return json(
        {
          error:
            "Senha atualizada. Entre novamente para concluir a liberaÃ§Ã£o.",
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
    return json({ error: "AÃ§Ã£o nÃ£o autorizada." }, 403);
  }

  if (action === "delete-person") {
    const targetId = String(input.user_id ?? "");
    const { error } = await caller.rpc("eo_admin_delete_person", {
      p_user: targetId,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (
    action === "set-person-active" ||
    action === "issue-person-temporary-password" ||
    action === "issue-master-temporary-password"
  ) {
    const targetId = String(input.user_id ?? "");
    const legacy = action === "issue-master-temporary-password";
    if (legacy && targetId !== callerId)
      return json({ error: "Selecione a pessoa para emitir a senha." }, 403);
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(targetId))
      return json({ error: "UsuÃ¡rio invÃ¡lido." }, 400);
    const { data: identity } = await admin
      .from("eo_profiles")
      .select("login_chapa, role, active, master_admin, must_change_password")
      .eq("id", targetId)
      .maybeSingle();
    if (!identity) return json({ error: "UsuÃ¡rio nÃ£o encontrado." }, 404);
    if (action === "set-person-active") {
      if (targetId === callerId || typeof input.active !== "boolean")
        return json(
          {
            error: "Este acesso nÃ£o pode ser bloqueado ou reativado por aqui.",
          },
          403,
        );
      const { error: statusError } = await caller.rpc(
        "eo_admin_set_person_active",
        { p_user: targetId, p_active: input.active },
      );
      if (statusError)
        return json(
          {
            error:
              statusError.message || "NÃ£o foi possÃ­vel alterar o acesso.",
          },
          400,
        );
      return json({ ok: true });
    }
    if (!identity.active || !identity.login_chapa)
      return json(
        { error: "O usuÃ¡rio precisa estar ativo e ter uma chapa vinculada." },
        400,
      );
    // Admin-issued credentials also activate accounts left pending by the old email flow.
    // The Auth update below confirms the login alias and sets the temporary password.
    const password = generateTemporaryPassword();
    const alias = `app-${identity.login_chapa}@login.app-eo.invalid`;
    const { error: auditError } = await admin.from("eo_audit_events").insert({
      actor: callerId,
      action: "identity.temporary_password_requested",
      entity_id: targetId,
    });
    if (auditError)
      return json(
        { error: "NÃ£o foi possÃ­vel registrar a solicitaÃ§Ã£o." },
        503,
      );
    const { error: flagError } = await admin
      .from("eo_profiles")
      .update({ must_change_password: true })
      .eq("id", targetId);
    if (flagError)
      return json(
        { error: "NÃ£o foi possÃ­vel ativar a troca obrigatÃ³ria." },
        503,
      );
    const { error: passwordError } = await admin.auth.admin.updateUserById(
      targetId,
      {
        email: alias,
        email_confirm: true,
        password,
      },
    );
    if (passwordError) {
      if (!identity.must_change_password) {
        await admin
          .from("eo_profiles")
          .update({ must_change_password: false })
          .eq("id", targetId);
      }
      return json(
        { error: "NÃ£o foi possÃ­vel preparar a senha temporÃ¡ria." },
        400,
      );
    }
    await admin.from("eo_audit_events").insert({
      actor: callerId,
      action: legacy
        ? "identity.master_temporary_password_issued"
        : "identity.temporary_password_issued",
      entity_id: targetId,
    });
    return json({ password });
  }

  if (action === "invite-person")
    return json(
      { error: "Atualize o EO para cadastrar com senha temporÃ¡ria." },
      400,
    );

  if (action === "create-person") {
    const email = String(input.email ?? "")
      .trim()
      .toLowerCase();
    const name = String(input.name ?? "").trim();
    const chapa = String(input.chapa ?? "").trim();
    const role = String(input.role ?? "");
    const unitType = String(
      input.unit_type ?? (role === "admin" ? "administracao" : "loja"),
    );
    if (!unitTypes.some((value) => value === unitType))
      return json({ error: "Unidade inválida." }, 400);
    const { data: preferences, error: preferencesError } = await admin
      .from("eo_identity_preferences")
      .select("email_domains,require_email")
      .eq("id", true)
      .single();
    if (preferencesError)
      return json(
        { error: "Não foi possível conferir as preferências da organização." },
        503,
      );
    const domains = preferences.email_domains as string[];
    const emailValidation = validateOrganizationEmail(
      email,
      domains,
      preferences.require_email,
    );
    if (emailValidation) return json({ error: emailValidation }, 400);
    const stores = Array.isArray(input.stores)
      ? [...new Set(input.stores.map(String))]
      : [];
    if (
      (email && (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)) ||
      name.length < 2 ||
      name.length > 120 ||
      !/^\d{1,20}$/.test(chapa)
    ) {
      return json({ error: "Confira nome, e-mail e chapa." }, 400);
    }
    if (!["colaborador", "gerente", "diretor", "admin"].includes(role))
      return json({ error: "Perfil invÃ¡lido." }, 400);
    if (unitType === "loja" && !stores.length)
      return json({ error: "Selecione ao menos uma loja." }, 400);
    if (stores.some((store) => !/^[0-9a-f-]{36}$/i.test(store)))
      return json({ error: "Lista de lojas invÃ¡lida." }, 400);

    const [
      { data: existingChapa, error: chapaError },
      { data: existingEmail, error: emailError },
    ] = await Promise.all([
      admin.from("eo_profiles").select("id").eq("login_chapa", chapa).limit(1),
      email
        ? admin
            .from("eo_profiles")
            .select("id")
            .eq("contact_email", email)
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (chapaError || emailError)
      return json({ error: "NÃ£o foi possÃ­vel validar o cadastro." }, 503);
    if (existingChapa?.length || existingEmail?.length)
      return json({ error: "Chapa ou e-mail jÃ¡ cadastrado." }, 409);
    // Keep each lookup URL short when an invitation covers hundreds of stores.
    for (let offset = 0; offset < stores.length; offset += 100) {
      const batch = stores.slice(offset, offset + 100);
      const { data: knownStores, error: storeLookupError } = await admin
        .from("eo_stores")
        .select("id")
        .eq("active", true)
        .in("id", batch);
      if (storeLookupError || knownStores?.length !== batch.length) {
        return json({ error: "Confira as lojas selecionadas." }, 400);
      }
    }

    const password = generateTemporaryPassword();
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: `app-${chapa}@login.app-eo.invalid`,
        password,
        email_confirm: true,
        user_metadata: { display_name: name, login_chapa: chapa },
      });
    const person = created.user;
    if (createError || !person)
      return json(
        {
          error:
            "NÃ£o foi possÃ­vel criar a conta. Confira se a chapa jÃ¡ estÃ¡ em uso.",
        },
        409,
      );

    const { error: profileInsertError } = await admin
      .from("eo_profiles")
      .insert({
        id: person.id,
        display_name: name,
        role,
        unit_type: unitType,
        login_chapa: chapa,
        contact_email: email || null,
        active: false,
        must_change_password: true,
      });
    if (profileInsertError) {
      await admin.auth.admin.deleteUser(person.id);
      return json(
        {
          error:
            "NÃ£o foi possÃ­vel criar o perfil. Confira a chapa e o e-mail.",
        },
        409,
      );
    }
    if (stores.length) {
      const { error: storesError } = await admin
        .from("eo_store_members")
        .insert(
          stores.map((store_id) => ({
            user_id: person.id,
            store_id,
          })),
        );
      if (storesError) {
        return json(
          {
            error:
              "Conta criada, mas nÃ£o foi possÃ­vel vincular as lojas. O acesso permanece bloqueado atÃ© revisÃ£o.",
          },
          400,
        );
      }
    }
    const { error: creationAuditError } = await admin
      .from("eo_audit_events")
      .insert({
        actor: callerId,
        action: "member.created",
        entity_id: person.id,
        detail: { role, store_count: stores.length },
      });
    if (creationAuditError)
      return json(
        {
          error:
            "Perfil criado e mantido bloqueado. NÃ£o foi possÃ­vel registrar o cadastro.",
        },
        503,
      );
    const { error: activationError } = await admin
      .from("eo_profiles")
      .update({ active: true })
      .eq("id", person.id);
    if (activationError)
      return json(
        { error: "Perfil criado, mas o acesso permanece bloqueado." },
        503,
      );
    return json({ ok: true, password });
  }

  return json({ error: "AÃ§Ã£o desconhecida." }, 400);
});
