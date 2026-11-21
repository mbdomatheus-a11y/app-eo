import { useEffect, useState } from "react";
import { EsqueletoLista } from "./Loading";
import { Pressable, Text, View } from "react-native";
import { ScreenTitle, Group, d } from "../design";
import { rpc } from "../services/supabase";
import { Button, Card, C, Field, Page, Section, s } from "../ui";
import { ScaleEditor } from "./ScaleEditor";

type Loja = { id: string; codigo: string; nome: string; modelo: string };
type Semana = { id: string; semana_inicio: string; modelo: string; status: string; versao: number; atualizado_em: string };
type Contexto = { loja: { id: string; codigo: string; nome: string }; pode_editar: boolean; colaboradores: { chapa: string; nome: string; cargo: string | null; departamento: string | null; jornada_diaria_min: number | null; situacao: string | null }[] };
type Periodo = "week" | "month" | "year";
const periodos: [Periodo, string][] = [["week", "Semana"], ["month", "Mês"], ["year", "Ano"]];
const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
function filtrar(semanas: Semana[], periodo: Periodo) {
  const hoje = new Date();
  const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const segunda = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7));
  const seg = `${segunda.getFullYear()}-${String(segunda.getMonth() + 1).padStart(2, "0")}-${String(segunda.getDate()).padStart(2, "0")}`;
  return semanas.filter((item) => periodo === "week" ? item.semana_inicio === seg : periodo === "month" ? item.semana_inicio.slice(0, 7) === iso.slice(0, 7) : item.semana_inicio.slice(0, 4) === iso.slice(0, 4));
}

export function ScaleScreen() {
  const [busca, setBusca] = useState("");
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [loja, setLoja] = useState<Loja | null>(null);
  const [unica, setUnica] = useState(false);
  const [escolhendo, setEscolhendo] = useState(true);
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [semanas, setSemanas] = useState<Semana[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>("month");
  const [erro, setErro] = useState("");
  const [carregandoLojas, setCarregandoLojas] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [revisao, setRevisao] = useState(0);
  const [abrindo, setAbrindo] = useState(false);
  const [aberta, setAberta] = useState<{ html: string; estado: unknown; semana: string | null; versao: number | null; rotulo: string } | null>(null);

  useEffect(() => {
    let ativo = true;
    setCarregandoLojas(true);
    const timer = setTimeout(() => {
      void rpc<Loja[]>("escala_lojas_disponiveis", { p_busca: busca.trim() || null, p_limite: 50, p_offset: 0 }).then((resultado) => {
        if (!ativo) return;
        const lista = resultado ?? [];
        setLojas(lista);
        if (!busca.trim() && lista.length === 1) { setUnica(true); setLoja(lista[0]); }
        else if (!busca.trim()) setUnica(false);
        setErro("");
      }).catch((e) => { if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível carregar as lojas."); }).finally(() => { if (ativo) setCarregandoLojas(false); });
    }, 250);
    return () => { ativo = false; clearTimeout(timer); };
  }, [busca, revisao]);

  useEffect(() => {
    if (!loja) { setContexto(null); setSemanas([]); return; }
    let ativo = true;
    setContexto(null); setSemanas([]); setCarregando(true); setErro("");
    void Promise.all([
      rpc<Contexto>("escala_contexto", { p_loja: loja.id }),
      rpc<Semana[]>("escala_listar_semanas", { p_loja: loja.id, p_limite: 100 }),
    ]).then(([ctx, lista]) => { if (ativo) { setContexto(ctx); setSemanas(lista ?? []); } })
      .catch((e) => { if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível carregar as escalas."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [loja?.id, revisao]);

  async function abrir(semana?: Semana) {
    if (!loja || !contexto || abrindo) return;
    setAbrindo(true); setErro("");
    try {
      const html = await rpc<{ conteudo: string } | null>("escala_html_ativo");
      if (!html?.conteudo) throw new Error("Nenhuma versão da escala foi publicada pelo administrador.");
      const salvo = semana ? await rpc<{ dados: unknown; versao: number; semana_inicio: string } | null>("escala_obter_semana", { p_loja: loja.id, p_semana: semana.semana_inicio }) : null;
      if (semana && !salvo) throw new Error("Esta semana não está mais disponível. Atualize a lista.");
      setAberta({ html: html.conteudo, estado: salvo?.dados ?? null, semana: salvo?.semana_inicio ?? null, versao: salvo?.versao ?? null, rotulo: semana ? `Semana de ${dataBR(semana.semana_inicio)}` : "Novo planejamento" });
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível abrir a escala."); }
    finally { setAbrindo(false); }
  }
  if (aberta && contexto) return <ScaleEditor {...aberta} contexto={contexto} onClose={() => { setAberta(null); setRevisao((v) => v + 1); }} />;
  const lista = filtrar(semanas, periodo);
  return <Page>
    <ScreenTitle title="Escala de colaboradores" subtitle="Planejamento 5x2 e 6x1 das suas lojas." />
    {erro ? <Card><Text accessibilityRole="alert" style={{ color: C.red }}>{erro}</Text><Button title="Tentar novamente" secondary onPress={() => setRevisao((v) => v + 1)} /></Card> : null}
    {!unica && loja && !escolhendo && <Card>
      <Text style={{ color: C.ink, fontWeight: "700" }}>{loja.codigo} · {loja.nome}</Text>
      <Button title="Trocar loja" secondary disabled={abrindo} onPress={() => { setBusca(""); setEscolhendo(true); }} />
    </Card>}
    {!unica && (escolhendo || !loja) && <>
      <Section title="Escolha uma loja" />
      {loja && <Button title="Cancelar troca" secondary onPress={() => setEscolhendo(false)} />}
      <Field label="Buscar loja" placeholder="Código ou nome" value={busca} editable={!abrindo} onChangeText={setBusca} />
      {carregandoLojas ? <EsqueletoLista quantidade={4} rotulo="Carregando lojas" /> : <Group>{lojas.slice(0, 10).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: loja?.id === item.id, disabled: abrindo }} disabled={abrindo} onPress={() => { setLoja(item); setEscolhendo(false); }} style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.line }}><Text style={{ color: C.ink, fontWeight: "700" }}>{item.codigo} · {item.nome}</Text><Text style={s.small}>{item.modelo}{loja?.id === item.id ? " · Selecionada" : ""}</Text></Pressable>)}</Group>}
      {!carregandoLojas && !lojas.length && <Text style={s.small}>Nenhuma loja encontrada.</Text>}
      {lojas.length > 10 && <Text style={s.small}>Mostrando 10 lojas. Refine a busca para encontrar outras.</Text>}
    </>}
    {carregando && <EsqueletoLista quantidade={3} rotulo="Carregando escalas" />}
    {loja && contexto && (unica || !escolhendo) && <>
      <Section title={`${contexto.loja.codigo} · ${contexto.loja.nome}`} />
      <Text style={s.small}>{contexto.colaboradores.length} colaboradores na base.</Text>
      {contexto.pode_editar && <Button title={abrindo ? "Abrindo…" : "Novo planejamento"} disabled={abrindo} onPress={() => void abrir()} />}
      <View style={d.filterTrack}>{periodos.map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: periodo === id }} onPress={() => setPeriodo(id)} style={[d.filter, periodo === id && d.filterActive]}><Text style={[d.filterText, periodo === id && d.filterTextActive]}>{label}</Text></Pressable>)}</View>
      {lista.length ? <Group>{lista.map((item) => <Pressable key={item.id} accessibilityRole="button" disabled={abrindo} onPress={() => void abrir(item)} style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: C.line, gap: 4 }}><Text style={{ color: C.ink, fontWeight: "700" }}>Semana de {dataBR(item.semana_inicio)}</Text><Text style={s.small}>{item.modelo} · {item.status === "finalizada" ? "Finalizada" : "Rascunho"} · versão {item.versao}</Text><Text style={s.small}>Salva em {new Date(item.atualizado_em).toLocaleString("pt-BR")}</Text></Pressable>)}</Group> : <Card><Text style={s.small}>Nenhuma escala salva neste período.</Text></Card>}
      {semanas.length === 100 && <Text style={s.small}>Exibindo as 100 semanas mais recentes.</Text>}
    </>}
  </Page>;
}
