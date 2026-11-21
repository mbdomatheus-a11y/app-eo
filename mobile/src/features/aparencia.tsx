// Fotos do novo visual (21/11/2026). Cada espaço tem uma foto padrão no app; o administrador pode trocar
// em Mais, Aparência e fotos. As trocas ficam em public.eo_aparencia_fotos e no bucket público eo-aparencia.
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { rawRpc, supabase } from "../services/supabase";
import { C } from "../ui";

export type EspacoFoto =
  | "login" | "inicio" | "vazio" | "notices" | "sales" | "product" | "assortment"
  | "diary" | "mood" | "checklists" | "reports" | "agenda" | "escala";

const FOTOS = {
  atendimento: require("../../assets/fotos/atendimento-casaco.jpg"),
  caixa: require("../../assets/fotos/caixa-cliente.jpg"),
  arara: require("../../assets/fotos/cliente-arara.jpg"),
  clientes: require("../../assets/fotos/duas-clientes.jpg"),
  equipe: require("../../assets/fotos/equipe-loja.jpg"),
  escritorio: require("../../assets/fotos/escritorio-loja.jpg"),
  estoque: require("../../assets/fotos/estoque-tablet.jpg"),
  gerente: require("../../assets/fotos/gerente-tablet.jpg"),
  loja: require("../../assets/fotos/loja-araras.jpg"),
};

export const ESPACOS: { id: EspacoFoto; titulo: string; onde: string; padrao: ImageSourcePropType }[] = [
  { id: "login", titulo: "Entrada", onde: "Tela de login do app e do site", padrao: FOTOS.atendimento },
  { id: "inicio", titulo: "Início", onde: "Banner da Visão geral", padrao: FOTOS.loja },
  { id: "vazio", titulo: "Telas vazias", onde: "Quando não há itens para mostrar", padrao: FOTOS.arara },
  { id: "checklists", titulo: "Checklists", onde: "Capa do módulo", padrao: FOTOS.gerente },
  { id: "notices", titulo: "Comunicados", onde: "Capa do módulo", padrao: FOTOS.escritorio },
  { id: "sales", titulo: "Vendas", onde: "Capa do módulo", padrao: FOTOS.caixa },
  { id: "product", titulo: "Voz do Cliente", onde: "Capa do módulo", padrao: FOTOS.arara },
  { id: "assortment", titulo: "Sortimento", onde: "Capa do módulo", padrao: FOTOS.estoque },
  { id: "diary", titulo: "Ocorrências do Dia", onde: "Capa do módulo", padrao: FOTOS.clientes },
  { id: "mood", titulo: "Como está o seu dia", onde: "Capa do módulo", padrao: FOTOS.equipe },
  { id: "escala", titulo: "Escala", onde: "Capa do módulo", padrao: FOTOS.equipe },
  { id: "agenda", titulo: "Agenda de ações", onde: "Capa do módulo", padrao: FOTOS.gerente },
  { id: "reports", titulo: "Relatórios", onde: "Capa do módulo", padrao: FOTOS.escritorio },
];

type Troca = { caminho: string; posicao: "top" | "center" | "bottom"; atualizado?: string };
type Trocas = Partial<Record<EspacoFoto, Troca>>;
const CHAVE_CACHE = "eo.aparencia.v1";
export const BUCKET_APARENCIA = "eo-aparencia";

const Contexto = createContext<{ trocas: Trocas; definir: (t: Trocas) => void; recarregar: () => Promise<void> }>({
  trocas: {},
  definir: () => {},
  recarregar: async () => {},
});

export function AparenciaProvider({ children }: { children: ReactNode }) {
  const [trocas, setTrocas] = useState<Trocas>({});
  const definir = useCallback((t: Trocas) => {
    setTrocas(t);
    void SecureStore.setItemAsync(CHAVE_CACHE, JSON.stringify(t)).catch(() => {});
  }, []);
  const recarregar = useCallback(async () => {
    try {
      definir((await rawRpc<Trocas>("eo_aparencia_fotos")) ?? {});
    } catch {
      // Sem conexão: mantém o que estava salvo e as fotos padrão.
    }
  }, [definir]);
  useEffect(() => {
    void SecureStore.getItemAsync(CHAVE_CACHE)
      .then((v) => v && setTrocas(JSON.parse(v) as Trocas))
      .catch(() => {})
      .finally(() => void recarregar());
  }, [recarregar]);
  const valor = useMemo(() => ({ trocas, definir, recarregar }), [trocas, definir, recarregar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useAparencia = () => useContext(Contexto);

export function urlTroca(troca: Troca) {
  if (!supabase) return null;
  const { data } = supabase.storage.from(BUCKET_APARENCIA).getPublicUrl(troca.caminho);
  return `${data.publicUrl}?v=${encodeURIComponent(troca.atualizado ?? "")}`;
}

export function useFoto(espaco: EspacoFoto): { fonte: ImageSourcePropType; posicao: Troca["posicao"]; trocada: boolean } {
  const { trocas } = useAparencia();
  const troca = trocas[espaco];
  const padrao = ESPACOS.find((e) => e.id === espaco)?.padrao ?? FOTOS.loja;
  const url = troca ? urlTroca(troca) : null;
  return url
    ? { fonte: { uri: url }, posicao: troca!.posicao, trocada: true }
    : { fonte: padrao, posicao: "center", trocada: false };
}

// Degradê escuro de baixo para cima feito com camadas leves (sem dependência nativa nova, para não exigir build).
const DEGRADE = [30, 38, 46, 53, 60, 66, 72, 78, 84, 90];

const alinhar = (p: Troca["posicao"]) => (p === "top" ? "0%" : p === "bottom" ? "100%" : "50%");

/** Foto com véu escuro e texto por cima, no padrão de capas da Apple. */
export function FotoCapa({
  espaco,
  altura = 200,
  titulo,
  subtitulo,
  etiqueta,
  arredondada = true,
  style,
  children,
}: {
  espaco: EspacoFoto;
  altura?: number | null;
  titulo?: string;
  subtitulo?: string;
  etiqueta?: string;
  arredondada?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const foto = useFoto(espaco);
  return (
    <ImageBackground
      source={foto.fonte}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      imageStyle={[arredondada && { borderRadius: 22 }, { objectPosition: `50% ${alinhar(foto.posicao)}` } as never]}
      style={[altura === null ? null : { height: altura }, { justifyContent: "flex-end", overflow: "hidden" }, arredondada && { borderRadius: 22 }, style]}
    >
      <View style={[StyleSheet.absoluteFill, f.veu, arredondada && { borderRadius: 22 }]} />
      {DEGRADE.map((topo) => (
        <View
          key={topo}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { top: `${topo}%`, backgroundColor: "rgba(0,0,0,0.06)" }, arredondada && { borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }]}
        />
      ))}
      <View style={f.texto}>
        {etiqueta ? <Text style={f.etiqueta}>{etiqueta}</Text> : null}
        {titulo ? <Text style={[f.titulo, altura !== null && altura < 150 && f.tituloCompacto]} numberOfLines={2}>{titulo}</Text> : null}
        {subtitulo ? <Text style={f.subtitulo} numberOfLines={2}>{subtitulo}</Text> : null}
        {children}
      </View>
    </ImageBackground>
  );
}

/** Estado vazio com foto suave, texto curto e ação opcional. */
export function EstadoVazio({
  titulo,
  texto,
  acao,
  aoTocar,
  espaco = "vazio",
}: {
  titulo: string;
  texto: string;
  acao?: string;
  aoTocar?: () => void;
  espaco?: EspacoFoto;
}) {
  const foto = useFoto(espaco);
  return (
    <View style={f.vazio}>
      <ImageBackground source={foto.fonte} resizeMode="cover" style={f.vazioFoto} imageStyle={{ borderRadius: 18, opacity: 0.9 }}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 18 }]} />
      </ImageBackground>
      <Text style={f.vazioTitulo}>{titulo}</Text>
      <Text style={f.vazioTexto}>{texto}</Text>
      {acao && aoTocar ? (
        <Pressable accessibilityRole="button" onPress={aoTocar} style={({ pressed }) => [f.vazioBotao, pressed && { opacity: 0.7 }]}>
          <Text style={f.vazioBotaoTexto}>{acao}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const f = StyleSheet.create({
  veu: { backgroundColor: "rgba(0,0,0,0.08)" },
  texto: { paddingHorizontal: 20, paddingVertical: 16, gap: 3 },
  etiqueta: { color: "#FFFFFF", opacity: 0.85, fontSize: 13, fontWeight: "600", letterSpacing: 0.2 },
  titulo: { color: "#FFFFFF", fontSize: 28, lineHeight: 33, fontWeight: "700", letterSpacing: -0.6 },
  tituloCompacto: { fontSize: 22, lineHeight: 26 },
  subtitulo: { color: "rgba(255,255,255,0.9)", fontSize: 15, lineHeight: 20 },
  vazio: { alignItems: "center", paddingVertical: 12, gap: 8 },
  vazioFoto: { width: "100%", maxWidth: 420, height: 150, marginBottom: 6 },
  vazioTitulo: { color: C.ink, fontSize: 19, fontWeight: "700", letterSpacing: -0.3, textAlign: "center" },
  vazioTexto: { color: C.muted, fontSize: 15, lineHeight: 21, textAlign: "center", maxWidth: 420 },
  vazioBotao: { marginTop: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: C.dark },
  vazioBotaoTexto: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
});

export function saudacao(agora = new Date()) {
  const h = agora.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** Capa compacta no topo de cada módulo. */
export function CapaModulo({ espaco, titulo, detalhe }: { espaco: EspacoFoto; titulo: string; detalhe?: string }) {
  return (
    <View style={c.envoltorio}>
      <FotoCapa espaco={espaco} altura={112} titulo={titulo} subtitulo={detalhe} style={c.capa} />
    </View>
  );
}

const c = StyleSheet.create({
  envoltorio: { paddingHorizontal: 18, paddingTop: 8, width: "100%", maxWidth: 1040, alignSelf: "center" },
  capa: { borderRadius: 20 },
});
