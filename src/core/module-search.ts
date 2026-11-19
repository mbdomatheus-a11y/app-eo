// Busca de módulos do site (Fundação, especificação de 19/11/2026). Mesmos termos do catálogo do app
// em mobile/src/features/module-catalog.ts; manter os dois alinhados ao incluir módulos.
export const TERMOS_MODULO: Record<string, string[]> = {
  home: ["inicio", "visao geral"],
  notices: ["comunicado", "aviso", "ciencia"],
  modules: ["aplicativos", "modulos"],
  agenda: ["agenda", "acao", "pendencia", "lembrete"],
  sales: ["venda", "meta", "resultado", "atingimento"],
  escala: ["escala", "folga", "5x2", "6x1", "horario", "ferias"],
  product: ["voz", "cliente", "pedido", "produto", "falta"],
  assortment: ["sortimento", "grade", "tamanho", "bipar", "codigo"],
  diary: ["ocorrencia", "diario", "evento", "chuva", "energia", "audio"],
  mood: ["sentimento", "humor", "dia", "carinha"],
  checklists: ["checklist", "pesquisa", "rotina", "pergunta"],
  admin: ["administracao", "admin", "pessoas", "lojas", "acesso", "auditoria"],
};

export const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function buscarModulos<T extends { id: string; label: string }>(consulta: string, itens: T[]): T[] {
  const partes = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!partes.length) return [];
  return itens
    .filter((item) => {
      const alvo = normalizar([item.label, ...(TERMOS_MODULO[item.id] ?? [])].join(" "));
      return partes.every((p) => alvo.includes(p));
    })
    .slice(0, 8);
}
