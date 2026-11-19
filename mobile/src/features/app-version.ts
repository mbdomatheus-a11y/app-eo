// Versão do app (19/11/2026, pedido de Matheus): mostrar a versão em uso e a anterior, com data e hora,
// para ter certeza de que uma compilação ou atualização OTA chegou ao aparelho.
// Compilação e commit vêm de EXPO_PUBLIC_EO_BUILD e EXPO_PUBLIC_EO_COMMIT, gravados pelos workflows.
// Numa OTA o JavaScript é trocado; por isso a compilação instalada é guardada na primeira abertura
// da instalação (isEmbeddedLaunch) e lida dali nas aberturas por OTA.
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";

export type VersaoApp = {
  versao: string;
  compilacao: string | null;
  commit: string | null;
  origem: "instalacao" | "atualizacao" | "desenvolvimento";
  updateId: string | null;
  publicadaEm: string | null; // data de geração do pacote em uso (Updates.createdAt)
  runtime: string | null;
  canal: string | null;
  vistaDesde?: string; // primeira abertura deste pacote neste aparelho
};
export type HistoricoVersao = { atual: VersaoApp; anterior: VersaoApp | null };

const CHAVE_HISTORICO = "eo.versao-historico.v1";
const CHAVE_COMPILACAO = "eo.compilacao-instalada.v1";
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function lerAtual(compilacaoInstalada: string | null): VersaoApp {
  const commit = texto(process.env.EXPO_PUBLIC_EO_COMMIT);
  return {
    versao: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "?",
    compilacao: compilacaoInstalada ?? texto(Constants.nativeBuildVersion),
    commit: commit ? commit.slice(0, 7) : null,
    origem: !Updates.isEnabled ? "desenvolvimento" : Updates.isEmbeddedLaunch ? "instalacao" : "atualizacao",
    updateId: Updates.updateId ?? null,
    publicadaEm: Updates.createdAt ? Updates.createdAt.toISOString() : null,
    runtime: Updates.runtimeVersion ?? null,
    canal: Updates.channel ?? null,
  };
}

let registro: Promise<HistoricoVersao> | null = null;
export function registrarVersao(): Promise<HistoricoVersao> {
  registro ??= (async () => {
    let compilacao: string | null = null;
    try {
      if (Updates.isEmbeddedLaunch && texto(process.env.EXPO_PUBLIC_EO_BUILD)) {
        compilacao = texto(process.env.EXPO_PUBLIC_EO_BUILD);
        await SecureStore.setItemAsync(CHAVE_COMPILACAO, compilacao!);
      } else compilacao = await SecureStore.getItemAsync(CHAVE_COMPILACAO);
    } catch {
      compilacao = null;
    }
    const atual = lerAtual(compilacao);
    const assinatura = (v: VersaoApp) => `${v.updateId ?? "-"}|${v.compilacao ?? "-"}|${v.runtime ?? "-"}`;
    let salvo: HistoricoVersao | null = null;
    try {
      const bruto = await SecureStore.getItemAsync(CHAVE_HISTORICO);
      salvo = bruto ? (JSON.parse(bruto) as HistoricoVersao) : null;
    } catch {
      salvo = null;
    }
    let historico: HistoricoVersao;
    if (salvo?.atual && assinatura(salvo.atual) === assinatura(atual))
      historico = { atual: { ...atual, vistaDesde: salvo.atual.vistaDesde }, anterior: salvo.anterior ?? null };
    else historico = { atual: { ...atual, vistaDesde: new Date().toISOString() }, anterior: salvo?.atual ?? null };
    try {
      await SecureStore.setItemAsync(CHAVE_HISTORICO, JSON.stringify(historico));
    } catch {
      // Sem armazenamento seguro: a tela mostra só a versão atual.
    }
    return historico;
  })();
  return registro;
}

export const dataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "não informada";

export function resumoVersao(v: VersaoApp): string {
  const partes = [`EO ${v.versao}`];
  if (v.compilacao) partes.push(`compilação ${v.compilacao}`);
  partes.push(v.origem === "atualizacao" ? `atualização de ${dataHora(v.publicadaEm)}` : v.origem === "instalacao" ? `instalação de ${dataHora(v.publicadaEm)}` : "desenvolvimento");
  if (v.commit) partes.push(`código ${v.commit}`);
  return partes.join(" · ");
}
