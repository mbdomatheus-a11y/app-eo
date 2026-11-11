// Envia ao EO (tabela comum app_erros) os erros de tela, inclusive antes do login, e impede que um
// erro fatal de JavaScript feche o app sozinho. Erro nativo não passa por aqui.
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { supabase } from "../services/supabase";

let instalado = false;
let enviados = 0;

export function reportarErro(error: unknown, fatal: boolean, contexto: Record<string, unknown> = {}) {
  if (!supabase || enviados >= 20) return;
  enviados++;
  const e = error instanceof Error ? error : new Error(String(error));
  const versao = `${Constants.expoConfig?.version ?? "?"} ${Updates.updateId ?? "embutido"}`;
  void supabase
    .rpc("app_registrar_erro", {
      p_app: "eo",
      p_plataforma: Platform.OS,
      p_versao: versao,
      p_mensagem: e.message || "sem mensagem",
      p_pilha: e.stack ?? null,
      p_fatal: fatal,
      p_contexto: contexto,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

type Handler = (error: unknown, isFatal?: boolean) => void;
export function instalarRelatorioDeErros() {
  if (instalado) return;
  instalado = true;
  const utils = (globalThis as unknown as { ErrorUtils?: { getGlobalHandler?: () => Handler; setGlobalHandler?: (h: Handler) => void } }).ErrorUtils;
  if (!utils?.setGlobalHandler) return;
  const anterior = utils.getGlobalHandler?.();
  utils.setGlobalHandler((error, isFatal) => {
    reportarErro(error, Boolean(isFatal), { origem: "global" });
    // Erro fatal não fecha mais o app; a tela de erro (ErrorBoundary) cuida do que for de interface.
    if (!isFatal && anterior) anterior(error, isFatal);
  });
}
