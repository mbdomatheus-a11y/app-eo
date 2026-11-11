// acesso-loja: contas genéricas de loja (gerNNN).
// A senha gravada no Auth é derivada (HMAC com ACESSO_LOJA_PEPPER). Sem este segredo ninguém entra
// direto pelo Auth, então todo login passa aqui, onde os erros são contados e a conta bloqueia no 3º erro.
// NUNCA trocar ACESSO_LOJA_PEPPER sem redefinir todas as contas de loja (as senhas deixariam de valer).
// Ações sem sessão: entrar, solicitar-reset. Com sessão da conta de loja: trocar-senha.
// Com sessão de admin: provisionar, redefinir. Agendador do banco: provisionar-pendentes.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const url = Deno.env.get("SUPABASE_URL")!;
const publishableKey = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!).default as string;
const secretKey = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!).default as string;
const pepper = Deno.env.get("ACESSO_LOJA_PEPPER") ?? "";
const appUrl = Deno.env.get("APP_URL") ?? "";
const admin = createClient(url, secretKey, { auth: { persistSession: false } });
const publico = () => createClient(url, publishableKey, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": appUrl,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const DOMINIO_EXIBIDO = "pernambucanas.com.br";
const emailInterno = (usuario: string) => `loja-${usuario}@login.app-eo.invalid`;
// Formato da senha padrão fica no segredo ACESSO_LOJA_SENHA_MODELO (ex.: com {usuario}), fora do repositório público.
const modeloSenha = Deno.env.get("ACESSO_LOJA_SENHA_MODELO") ?? "";
const senhaPadrao = (usuario: string) => modeloSenha.replaceAll("{usuario}", usuario);

export function normalizarUsuario(valor: unknown): string | null {
  const v = String(valor ?? "").trim().toLowerCase().replace(`@${DOMINIO_EXIBIDO}`, "");
  const m = /^ger0*([0-9]{1,4})$/.exec(v);
  if (!m) return null;
  return `ger${m[1].padStart(3, "0")}`;
}

export function validarNovaSenha(usuario: string, senha: string): string | null {
  if (senha.length < 12 || senha.length > 64) return "Use de 12 a 64 caracteres.";
  if (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/[0-9]/.test(senha) || !/[^A-Za-z0-9]/.test(senha))
    return "Use letra maiúscula, minúscula, número e símbolo.";
  const baixa = senha.toLowerCase();
  if (baixa === senhaPadrao(usuario).toLowerCase() || baixa.includes(usuario))
    return "A nova senha não pode repetir a senha padrão nem conter o usuário.";
  if (/(.)\1\1\1/.test(senha)) return "Evite repetir o mesmo caractere várias vezes.";
  return null;
}

async function derivar(usuario: string, senha: string) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${usuario}:${senha}`)));
  const b64 = btoa(String.fromCharCode(...assinatura)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64}Aa1!`;
}

const origemValida = (v: unknown) => (["web", "ios", "android"].includes(String(v)) ? String(v) : "desconhecida");

async function contaPorUsuario(usuario: string) {
  const { data } = await admin.from("acesso_contas_loja").select("perfil_id,usuario,bloqueada,falhas,senha_padrao").eq("usuario", usuario).maybeSingle();
  return data;
}

async function usuarioDaSessao(req: Request) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return null;
  const { data, error } = await admin.auth.getUser(bearer);
  return error || !data.user ? null : data.user;
}

async function exigirAdmin(req: Request) {
  const user = await usuarioDaSessao(req);
  if (!user) return null;
  const { data } = await admin.from("perfis").select("role,active,must_change_password").eq("id", user.id).maybeSingle();
  if (!data?.active || data.role !== "admin" || data.must_change_password) return null;
  return user;
}

async function gravarSenha(perfilId: string, usuario: string, senha: string) {
  const { error } = await admin.auth.admin.updateUserById(perfilId, { password: await derivar(usuario, senha) });
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const origin = req.headers.get("origin");
  if (!appUrl || pepper.length < 32 || !modeloSenha.includes("{usuario}")) return json({ error: "Serviço de acesso não configurado." }, 503);
  if (origin && origin !== appUrl) return json({ error: "Origem não autorizada." }, 403);

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }
  const acao = String(input.acao ?? "");
  const origem = origemValida(input.origem);

  if (acao === "entrar") {
    const usuario = normalizarUsuario(input.usuario);
    const senha = String(input.senha ?? "");
    if (!usuario || !senha || senha.length > 128) return json({ error: "Informe usuário e senha." }, 400);
    const conta = await contaPorUsuario(usuario);
    if (!conta) return json({ error: "Usuário ou senha inválidos." }, 401);
    if (conta.bloqueada)
      return json({ error: "Conta bloqueada após 3 tentativas. Toque em Esqueci a senha para pedir a liberação ao administrador.", bloqueada: true }, 423);
    const { data, error } = await publico().auth.signInWithPassword({ email: emailInterno(usuario), password: await derivar(usuario, senha) });
    if (error || !data.session) {
      const { data: t } = await admin.rpc("acesso_loja_registrar_tentativa", { p_usuario: usuario, p_ok: false, p_origem: origem });
      if (t?.bloqueada)
        return json({ error: "Conta bloqueada após 3 tentativas. Toque em Esqueci a senha para pedir a liberação ao administrador.", bloqueada: true }, 423);
      const restantes = Math.max(0, 3 - Number(t?.falhas ?? 0));
      return json({ error: `Usuário ou senha inválidos. Restam ${restantes} tentativa(s).`, restantes }, 401);
    }
    const { data: ok } = await admin.rpc("acesso_loja_registrar_tentativa", { p_usuario: usuario, p_ok: true, p_origem: origem });
    if (!ok?.falhas && ok?.falhas !== 0) {
      await admin.auth.admin.signOut(data.session.access_token).catch(() => null);
      return json({ error: "Conta bloqueada. Peça a liberação ao administrador.", bloqueada: true }, 423);
    }
    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      trocar_senha: conta.senha_padrao,
    });
  }

  if (acao === "solicitar-reset") {
    const usuario = normalizarUsuario(input.usuario);
    if (usuario) await admin.rpc("acesso_loja_solicitar_reset", { p_usuario: usuario, p_origem: origem });
    return json({ ok: true, mensagem: "Pedido enviado ao administrador. Quando aprovado, a senha volta ao padrão da loja." });
  }

  if (acao === "trocar-senha") {
    const user = await usuarioDaSessao(req);
    if (!user) return json({ error: "Sessão necessária." }, 401);
    const { data: conta } = await admin.from("acesso_contas_loja").select("perfil_id,usuario,bloqueada").eq("perfil_id", user.id).maybeSingle();
    if (!conta || conta.bloqueada) return json({ error: "Fluxo disponível só para contas de loja ativas." }, 403);
    const atual = String(input.senha_atual ?? "");
    const nova = String(input.nova_senha ?? "");
    const regra = validarNovaSenha(conta.usuario, nova);
    if (regra) return json({ error: regra }, 400);
    const { error: confere } = await publico().auth.signInWithPassword({ email: emailInterno(conta.usuario), password: await derivar(conta.usuario, atual) });
    if (confere) {
      const { data: t } = await admin.rpc("acesso_loja_registrar_tentativa", { p_usuario: conta.usuario, p_ok: false, p_origem: origem });
      return json({ error: t?.bloqueada ? "Conta bloqueada após 3 tentativas." : "Senha atual incorreta." }, t?.bloqueada ? 423 : 400);
    }
    if (!(await gravarSenha(conta.perfil_id, conta.usuario, nova))) return json({ error: "Não foi possível gravar a nova senha." }, 503);
    await admin.rpc("acesso_loja_marcar_trocada", { p_perfil: conta.perfil_id });
    return json({ ok: true });
  }

  // provisionar-pendentes: chamado pelo pg_cron do banco, sem sessão e sem segredo. É seguro por desenho:
  // só cria a conta padrão de loja ativa que ainda não tem conta (o mesmo que o admin faria) e devolve só contagens.
  const automatico = acao === "provisionar-pendentes";
  const adminUser = automatico ? null : await exigirAdmin(req);
  if (!automatico && !adminUser) return json({ error: "Ação não autorizada." }, 403);

  if (acao === "provisionar" || automatico) {
    const limite = automatico ? 40 : Math.min(Math.max(Number(input.limite ?? 25), 1), 40);
    const [{ data: lojas, error: e1 }, { data: contas, error: e2 }] = await Promise.all([
      admin.from("lojas").select("id,code,name").eq("active", true),
      admin.from("acesso_contas_loja").select("loja_id"),
    ]);
    if (e1 || e2) return json({ error: "Não foi possível ler as lojas." }, 503);
    const comConta = new Set((contas ?? []).map((c) => c.loja_id));
    const pendentes = (lojas ?? []).filter((l) => /^[0-9]{1,4}$/.test(l.code) && !comConta.has(l.id));
    const criadas: string[] = [];
    const falhas: string[] = [];
    for (const loja of pendentes.slice(0, limite)) {
      const usuario = `ger${loja.code.padStart(3, "0")}`;
      const nome = `Gerência ${loja.code.padStart(3, "0")} ${loja.name}`;
      const { data: criado, error } = await admin.auth.admin.createUser({
        email: emailInterno(usuario),
        password: await derivar(usuario, senhaPadrao(usuario)),
        email_confirm: true,
        user_metadata: { display_name: nome, usuario_loja: usuario },
      });
      if (error || !criado.user) {
        falhas.push(usuario);
        continue;
      }
      const { error: vinculo } = await admin.rpc("acesso_loja_vincular", { p_perfil: criado.user.id, p_usuario: usuario, p_loja: loja.id, p_nome: nome });
      if (vinculo) {
        await admin.auth.admin.deleteUser(criado.user.id);
        falhas.push(usuario);
        continue;
      }
      criadas.push(usuario);
    }
    return json({ criadas: criadas.length, falhas, restantes: Math.max(0, pendentes.length - criadas.length - falhas.length) });
  }

  if (acao === "redefinir") {
    const perfilId = String(input.perfil_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(perfilId)) return json({ error: "Conta inválida." }, 400);
    const { data: conta } = await admin.from("acesso_contas_loja").select("perfil_id,usuario").eq("perfil_id", perfilId).maybeSingle();
    if (!conta) return json({ error: "Conta de loja não encontrada." }, 404);
    if (!(await gravarSenha(conta.perfil_id, conta.usuario, senhaPadrao(conta.usuario)))) return json({ error: "Não foi possível redefinir." }, 503);
    const solicitacao = input.solicitacao_id ? Number(input.solicitacao_id) : null;
    const { error } = await admin.rpc("acesso_loja_marcar_padrao", { p_perfil: conta.perfil_id, p_admin: adminUser!.id, p_solicitacao: solicitacao });
    if (error) return json({ error: "Senha redefinida, mas o registro falhou. Tente novamente." }, 503);
    return json({ ok: true, usuario: conta.usuario });
  }

  return json({ error: "Ação desconhecida." }, 400);
});
