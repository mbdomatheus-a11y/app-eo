// Lista de checklists agrupada por rotina (modelo aprovado em 21/11/2026).
// Uma rotina vira um cartão; cada loja é uma linha com progresso, situação e ações compactas.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ChecklistRun } from "../types";
import { AppIcon, C } from "../ui";
import { CalendarAction } from "./CalendarAction";

type Grupo = { chave: string; titulo: string; itens: ChecklistRun[] };

function agrupar(itens: ChecklistRun[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const run of itens) {
    const chave = run.template_id || run.title;
    let grupo = mapa.get(chave);
    if (!grupo) {
      grupo = { chave, titulo: run.title, itens: [] };
      mapa.set(chave, grupo);
    }
    grupo.itens.push(run);
  }
  return [...mapa.values()];
}

function situacao(run: ChecklistRun) {
  if (run.status === "completed") return { texto: "Concluído", fundo: "#E7F4EC", cor: C.green };
  if (run.status === "in_progress" || run.answered_count > 0)
    return { texto: `${run.answered_count} de ${run.item_count}`, fundo: C.yellow, cor: "#5C4A00" };
  return { texto: "Pendente", fundo: C.yellow, cor: "#5C4A00" };
}

export function ChecklistFeedList({
  items,
  onOpen,
}: {
  items: ChecklistRun[];
  onOpen: (run: ChecklistRun) => void;
}) {
  const [agendaAberta, setAgendaAberta] = useState<string | null>(null);
  return (
    <View style={{ gap: 12 }}>
      {agrupar(items).map((grupo) => {
        const concluidos = grupo.itens.filter((run) => run.status === "completed").length;
        return (
          <View key={grupo.chave} style={l.cartao}>
            <View style={l.cabecalho}>
              <Text style={l.titulo} numberOfLines={2}>
                {grupo.titulo}
              </Text>
              <Text style={l.resumo}>
                {grupo.itens.length} {grupo.itens.length === 1 ? "loja" : "lojas"} · {concluidos}{" "}
                {concluidos === 1 ? "concluída" : "concluídas"}
              </Text>
            </View>
            {grupo.itens.map((run) => {
              const tag = situacao(run);
              const progresso = run.item_count ? Math.min(1, run.answered_count / run.item_count) : 0;
              const agenda = agendaAberta === run.run_id;
              return (
                <View key={run.run_id} style={l.linhaBloco}>
                  <View style={l.linha}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Abrir checklist ${run.title} da loja ${run.store_name}`}
                      onPress={() => onOpen(run)}
                      style={({ pressed }) => [l.linhaPrincipal, pressed && { opacity: 0.7 }]}
                    >
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={l.loja} numberOfLines={1}>
                          {run.store_name}
                        </Text>
                        <View style={l.barra}>
                          <View style={[l.barraCheia, { width: `${Math.round(progresso * 100)}%` }]} />
                        </View>
                      </View>
                      <View style={[l.tag, { backgroundColor: tag.fundo }]}>
                        <Text style={[l.tagTexto, { color: tag.cor }]}>{tag.texto}</Text>
                      </View>
                      <AppIcon name="chevron.right" size={18} color={C.muted} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Adicionar à minha agenda"
                      accessibilityState={{ expanded: agenda }}
                      onPress={() => setAgendaAberta(agenda ? null : run.run_id)}
                      style={({ pressed }) => [l.icone, agenda && l.iconeAtivo, pressed && { opacity: 0.7 }]}
                    >
                      <AppIcon name="calendar" size={18} color={C.ink} />
                    </Pressable>
                  </View>
                  {agenda && (
                    <View style={{ paddingTop: 8 }}>
                      <CalendarAction title={`Checklist: ${run.title}`} description={run.store_name} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const l = StyleSheet.create({
  cartao: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    overflow: "hidden",
  },
  cabecalho: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 2 },
  titulo: { color: C.ink, fontSize: 16, fontWeight: "700" },
  resumo: { color: C.muted, fontSize: 12 },
  linhaBloco: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linha: { flexDirection: "row", alignItems: "center", gap: 8 },
  linhaPrincipal: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4, minHeight: 44 },
  loja: { color: C.ink, fontSize: 14, fontWeight: "600" },
  barra: { height: 5, borderRadius: 3, backgroundColor: C.canvas, overflow: "hidden" },
  barraCheia: { height: "100%", backgroundColor: C.dark, borderRadius: 3 },
  tag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagTexto: { fontSize: 11, fontWeight: "700" },
  icone: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  iconeAtivo: { backgroundColor: C.yellow, borderColor: C.yellowStrong },
});
