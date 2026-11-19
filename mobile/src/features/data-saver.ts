// Modo de baixo consumo de dados (especificação, seção 2): quando ligado, as atualizações automáticas
// em segundo plano passam de 1 em 1 minuto para 5 em 5 minutos. Fotos e anexos já carregam só ao tocar.
// A preferência fica no aparelho e vale a partir da próxima abertura de cada tela.
import * as SecureStore from "expo-secure-store";

const CHAVE = "eo.economia-dados.v1";
let ligado = false;
const ouvintes = new Set<(v: boolean) => void>();

export const carregarEconomiaDados = SecureStore.getItemAsync(CHAVE)
  .then((v) => {
    ligado = v === "1";
    ouvintes.forEach((f) => f(ligado));
  })
  .catch(() => undefined);

export const economiaDadosLigada = () => ligado;

export async function definirEconomiaDados(valor: boolean) {
  ligado = valor;
  ouvintes.forEach((f) => f(valor));
  try {
    await SecureStore.setItemAsync(CHAVE, valor ? "1" : "0");
  } catch {
    // Sem armazenamento: vale só até fechar o app.
  }
}

export function ouvirEconomiaDados(f: (v: boolean) => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

// Intervalo das atualizações automáticas, respeitando o modo de baixo consumo.
export const intervaloAtualizacao = (baseMs: number) => (ligado ? baseMs * 5 : baseMs);
