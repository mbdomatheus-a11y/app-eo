// Barra lateral estilo Mac para o site em tela larga (21/11/2026). No celular continua a barra inferior.
import { router, usePathname } from "expo-router";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useEO } from "../providers/eo-provider";
import { AppIcon, C } from "../ui";
import { GRUPOS, MODULOS } from "../features/module-catalog";

export const LARGURA_MINIMA_LATERAL = 900;

export function useTelaLarga() {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= LARGURA_MINIMA_LATERAL;
}

type Item = { chave: string; titulo: string; icone: string; rota: string; moduleId?: string; badge?: number };

export function Sidebar() {
  const app = useEO();
  const pathname = usePathname();
  const ws = app.workspace;
  if (!ws) return null;
  const pendentes = app.notices.filter((n) => !n.acknowledged).length;
  const principais: Item[] = [
    { chave: "inicio", titulo: "Visão geral", icone: "house.fill", rota: "/" },
    ...(app.moduleVisible("notices") ? [{ chave: "avisos", titulo: "Comunicados", icone: "bell.fill", rota: "/notices", badge: pendentes }] : []),
    { chave: "apps", titulo: "Aplicativos", icone: "square.grid.2x2.fill", rota: "/modules" },
  ];
  const vistos = new Set<string>();
  const grupos = GRUPOS.map((g) => ({
    titulo: g,
    itens: MODULOS.filter((m) => {
      if (m.grupo !== g || m.id === "notices" || !app.moduleVisible(m.id)) return false;
      const base = m.rota.split("?")[0];
      if (vistos.has(base)) return false;
      vistos.add(base);
      return true;
    }).map<Item>((m) => ({ chave: m.rota, titulo: m.titulo, icone: m.icone, rota: m.rota, moduleId: m.id })),
  })).filter((g) => g.itens.length);
  const ativo = (rota: string) => {
    const base = rota.split("?")[0];
    return base === "/" ? pathname === "/" : pathname === base || pathname.startsWith(`${base}/`);
  };
  const linha = (i: Item) => {
    const sel = ativo(i.rota);
    return (
      <Pressable
        key={i.chave}
        accessibilityRole="link"
        accessibilityState={{ selected: sel }}
        onPress={() => router.navigate(i.rota as never)}
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
          l.item,
          (hovered || pressed) && !sel && { backgroundColor: "rgba(0,0,0,0.04)" },
          sel && l.itemAtivo,
        ]}
      >
        <AppIcon name={i.icone} moduleId={i.moduleId} size={18} color={sel ? C.ink : C.dark} />
        <Text numberOfLines={1} style={[l.itemTexto, sel && { fontWeight: "600" }]}>
          {i.titulo}
        </Text>
        {!!i.badge && (
          <View style={l.badge}>
            <Text style={l.badgeTexto}>{i.badge > 99 ? "99+" : i.badge}</Text>
          </View>
        )}
      </Pressable>
    );
  };
  const iniciais = ws.person.name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <View style={l.lateral}>
      <View style={l.marca}>
        <Image source={require("../../assets/eo-icon.png")} style={l.logo} accessibilityLabel="EO" />
        <View>
          <Text style={l.marcaNome}>Excelência</Text>
          <Text style={l.marcaNome}>Operacional</Text>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        <View style={l.bloco}>{principais.map(linha)}</View>
        {grupos.map((g) => (
          <View key={g.titulo} style={l.bloco}>
            <Text style={l.grupo}>{g.titulo}</Text>
            {g.itens.map(linha)}
          </View>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.navigate("/profile" as never)}
        style={({ pressed }) => [l.conta, ativo("/profile") && l.itemAtivo, pressed && { opacity: 0.7 }]}
      >
        <View style={l.avatar}>
          <Text style={l.avatarTexto}>{iniciais}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={l.contaNome}>{ws.person.name}</Text>
          <Text numberOfLines={1} style={l.contaDetalhe}>Conta e ajustes</Text>
        </View>
      </Pressable>
    </View>
  );
}

const l = StyleSheet.create({
  lateral: {
    width: 256,
    backgroundColor: "#ECECEF",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#D1D1D6",
    paddingHorizontal: 10,
    paddingTop: 18,
    paddingBottom: 12,
  },
  marca: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, marginBottom: 18 },
  logo: { width: 34, height: 34, borderRadius: 8 },
  marcaNome: { fontSize: 12, lineHeight: 14, fontWeight: "600", color: C.dark, letterSpacing: 0.2 },
  bloco: { marginBottom: 14, gap: 1 },
  grupo: { fontSize: 12, fontWeight: "600", color: C.lightMuted, paddingHorizontal: 10, paddingBottom: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  itemAtivo: { backgroundColor: "rgba(0,0,0,0.08)" },
  itemTexto: { flex: 1, fontSize: 14, color: C.ink },
  badge: { minWidth: 20, paddingHorizontal: 6, height: 18, borderRadius: 9, backgroundColor: C.dark, alignItems: "center", justifyContent: "center" },
  badgeTexto: { color: C.paper, fontSize: 11, fontWeight: "600" },
  conta: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.yellow, alignItems: "center", justifyContent: "center" },
  avatarTexto: { fontSize: 12, fontWeight: "700", color: C.dark },
  contaNome: { fontSize: 13, fontWeight: "600", color: C.ink },
  contaDetalhe: { fontSize: 12, color: C.muted },
});
