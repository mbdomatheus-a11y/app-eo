// Catálogo único de módulos do app (Fundação, especificação de 19/11/2026).
// Fonte para Início, Aplicativos, busca no topo e botão central. Um módulo só aparece se
// app.moduleVisible(id) permitir; módulo desativado para a empresa não aparece nem na busca.
// Nomes da especificação: Diário de vendas passou a Ocorrências do Dia e Pedir produto a Voz do Cliente.
export type ModuloApp = {
  id: string; // id em modulos_acesso
  titulo: string;
  detalhe: string;
  icone: string;
  rota: string;
  grupo: "Pessoas e rotina" | "Vendas e comercial" | "Execução";
  termos: string[]; // palavras extras para a busca
};

export const MODULOS: ModuloApp[] = [
  { id: "escala", titulo: "Escala", detalhe: "Planejamento semanal da equipe", icone: "calendar", rota: "/escala", grupo: "Pessoas e rotina", termos: ["escala", "folga", "5x2", "6x1", "horario", "ferias"] },
  { id: "diary", titulo: "Ocorrências do Dia", detalhe: "Eventos da loja por voz ou texto", icone: "mic.fill", rota: "/diary", grupo: "Pessoas e rotina", termos: ["ocorrencia", "diario", "evento", "chuva", "energia", "audio"] },
  { id: "mood", titulo: "Como está o seu dia", detalhe: "Registro rápido de como você se sente", icone: "face.smiling", rota: "/mood", grupo: "Pessoas e rotina", termos: ["sentimento", "humor", "dia", "carinha"] },
  { id: "diary", titulo: "Resumo da equipe", detalhe: "Ocorrências por loja e regional", icone: "person.2.fill", rota: "/diary?tab=summary", grupo: "Pessoas e rotina", termos: ["resumo", "equipe", "regional"] },
  { id: "sales", titulo: "Vendas", detalhe: "Semana, mês e ano", icone: "chart.bar.fill", rota: "/sales?period=week", grupo: "Vendas e comercial", termos: ["venda", "meta", "resultado", "atingimento"] },
  { id: "product", titulo: "Voz do Cliente", detalhe: "Produto que o cliente pediu e a loja não tinha", icone: "shippingbox.fill", rota: "/product", grupo: "Vendas e comercial", termos: ["voz", "cliente", "pedido", "produto", "falta"] },
  { id: "assortment", titulo: "Sortimento por tamanho", detalhe: "Sessões e contagens por código", icone: "barcode.viewfinder", rota: "/assortment", grupo: "Vendas e comercial", termos: ["sortimento", "grade", "tamanho", "bipar", "codigo"] },
  { id: "checklists", titulo: "Checklists", detalhe: "Responder e acompanhar rotinas", icone: "checklist", rota: "/checklists", grupo: "Execução", termos: ["checklist", "pesquisa", "rotina", "pergunta"] },
  { id: "agenda", titulo: "Agenda de ações", detalhe: "Pendências e lembretes no calendário", icone: "calendar", rota: "/agenda", grupo: "Execução", termos: ["agenda", "acao", "pendencia", "lembrete"] },
  { id: "reports", titulo: "Relatórios", detalhe: "Central e auditoria conforme seu acesso", icone: "chart.bar.doc.horizontal", rota: "/reports", grupo: "Execução", termos: ["relatorio", "auditoria"] },
  { id: "notices", titulo: "Comunicados", detalhe: "Orientações e ciência", icone: "doc.text.fill", rota: "/notices", grupo: "Execução", termos: ["comunicado", "aviso", "ciencia"] },
];

export const GRUPOS: ModuloApp["grupo"][] = ["Pessoas e rotina", "Vendas e comercial", "Execução"];

// Atalhos do Início e ordem do menu do botão central, por uso mais frequente.
export const ATALHOS = ["/escala", "/sales?period=week", "/checklists", "/diary", "/product"];

export const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function buscarModulos(consulta: string, visivel: (id: string) => boolean): ModuloApp[] {
  const q = normalizar(consulta);
  if (!q) return [];
  const partes = q.split(/\s+/);
  return MODULOS.filter((m) => {
    if (!visivel(m.id)) return false;
    const alvo = normalizar([m.titulo, m.detalhe, ...m.termos].join(" "));
    return partes.every((p) => alvo.includes(p));
  }).slice(0, 8);
}

// Ação principal do contexto para o botão central: quem gere cria, quem responde responde.
export type AcaoPrincipal = { titulo: string; detalhe: string; icone: string; rota: string; modulo: string };
export function acaoPrincipal(aba: string, papel: string, visivel: (id: string) => boolean): AcaoPrincipal | null {
  const gestor = papel === "admin" || papel === "diretor";
  const opcoes: AcaoPrincipal[] =
    aba === "notices"
      ? gestor
        ? [{ titulo: "Novo comunicado", detalhe: "Oriente as lojas e acompanhe a ciência", icone: "plus", rota: "/compose", modulo: "notices" }]
        : []
      : gestor
        ? [{ titulo: "Novo comunicado", detalhe: "Oriente as lojas e acompanhe a ciência", icone: "plus", rota: "/compose", modulo: "notices" }]
        : [
            { titulo: "Responder checklists", detalhe: "Pendências da sua loja", icone: "checkmark.circle.fill", rota: "/checklists", modulo: "checklists" },
            { titulo: "Registrar ocorrência", detalhe: "Conte o que aconteceu na loja hoje", icone: "mic.fill", rota: "/diary", modulo: "diary" },
          ];
  return opcoes.find((o) => visivel(o.modulo)) ?? null;
}
