// Barra inferior do EO no padrão do Control ALL (11/11/2026, pedido do Matheus):
//   Início | Avisos | + | Aplicativos | Mais
// Barra em JavaScript (Tabs do expo-router) no lugar das abas nativas, que travavam no iPhone quando
// mudavam depois do login. Troca de aba com transição suave (fade) e o "+" abre ações rápidas numa
// camada comum (sem Modal nativo).
import { Tabs, router, usePathname } from "expo-router";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEO } from "../../providers/eo-provider";
import { AppIcon, C } from "../../ui";

type Acao = { id: string; titulo: string; detalhe: string; icone: string; rota: string };
const ACOES: Acao[] = [
  { id: "product", titulo: "Pedir produto", detalhe: "Solicite um item para a loja", icone: "list.bullet.rectangle.fill", rota: "/product" },
  { id: "checklists", titulo: "Checklists", detalhe: "Rotinas e respostas da equipe", icone: "checkmark.circle.fill", rota: "/checklists" },
  { id: "diary", titulo: "Diário de vendas", detalhe: "Relato do dia por voz ou texto", icone: "mic.fill", rota: "/diary" },
  { id: "assortment", titulo: "Sortimento", detalhe: "Bipar e conferir grade", icone: "camera.fill", rota: "/assortment" },
  { id: "mood", titulo: "Como está seu dia?", detalhe: "Registro rápido da equipe", icone: "person.3.fill", rota: "/mood" },
  { id: "agenda", titulo: "Agenda de ações", detalhe: "O que está pendente", icone: "doc.text.fill", rota: "/agenda" },
];

function AcoesRapidas({ aberto, fechar, embaixo }: { aberto: boolean; fechar: () => void; embaixo: number }) {
  const app = useEO();
  const anim = useRef(new Animated.Value(0)).current;
  const [montado, setMontado] = useState(aberto);
  useEffect(() => {
    if (aberto) setMontado(true);
    Animated.timing(anim, {
      toValue: aberto ? 1 : 0,
      duration: aberto ? 220 : 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !aberto) setMontado(false);
    });
  }, [aberto]);
  if (!montado) return null;
  const visiveis = ACOES.filter((a) => app.moduleVisible(a.id));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(20,22,28,0.35)", opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} accessibilityLabel="Fechar ações rápidas" />
      </Animated.View>
      <Animated.View
        style={[
          styles.folha,
          { bottom: embaixo + 8, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
        ]}
      >
        <Text style={styles.folhaTitulo}>Ações rápidas</Text>
        {visiveis.map((a) => (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            style={({ pressed }) => [styles.acao, pressed && { backgroundColor: C.canvas }]}
            onPress={() => {
              fechar();
              router.push(a.rota as never);
            }}
          >
            <View style={styles.acaoIcone}>
              <AppIcon name={a.icone} size={20} color={C.dark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.acaoTitulo}>{a.titulo}</Text>
              <Text style={styles.acaoDetalhe}>{a.detalhe}</Text>
            </View>
          </Pressable>
        ))}
        {!visiveis.length && <Text style={styles.acaoDetalhe}>Nenhuma ação liberada para seu acesso.</Text>}
      </Animated.View>
    </View>
  );
}

function Barra({ state, navigation }: BottomTabBarProps) {
  const app = useEO();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [acoes, setAcoes] = useState(false);
  useEffect(() => setAcoes(false), [pathname]);
  const pendentes = app.notices.filter((n) => !n.acknowledged).length;

  function ir(nome: string) {
    setAcoes(false);
    const idx = state.routes.findIndex((r) => r.name === nome);
    const rota = state.routes[idx];
    if (!rota) return;
    const ev = navigation.emit({ type: "tabPress", target: rota.key, canPreventDefault: true });
    if (state.index !== idx && !ev.defaultPrevented) navigation.navigate(rota.name, rota.params as never);
  }
  const ativo = (nome: string) => state.routes[state.index]?.name === nome;
  const item = (nome: string, titulo: string, icone: string, badge = 0) => {
    const cor = ativo(nome) ? C.dark : C.lightMuted;
    return (
      <Pressable
        key={nome}
        onPress={() => ir(nome)}
        accessibilityRole="tab"
        accessibilityState={{ selected: ativo(nome) }}
        accessibilityLabel={badge ? `${titulo}, ${badge} pendentes` : titulo}
        hitSlop={6}
        style={({ pressed }) => [styles.item, pressed && { opacity: 0.55 }]}
      >
        <View>
          <AppIcon name={icone} size={23} color={cor} />
          {badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeTexto}>{badge > 99 ? "99+" : badge}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={[styles.rotulo, { color: cor }]}>
          {titulo}
        </Text>
      </Pressable>
    );
  };
  const altura = 56 + insets.bottom;
  return (
    <>
      <AcoesRapidas aberto={acoes} fechar={() => setAcoes(false)} embaixo={altura} />
      <View style={[styles.barra, { paddingBottom: insets.bottom, height: altura }]}>
        {item("index", "Início", "house.fill")}
        {app.moduleVisible("notices") ? item("notices", "Avisos", "bell.fill", pendentes) : <View style={styles.item} />}
        <Pressable
          onPress={() => setAcoes((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={acoes ? "Fechar ações rápidas" : "Ações rápidas"}
          style={styles.item}
        >
          <View style={[styles.mais, acoes && { transform: [{ rotate: "45deg" }] }]}>
            <Text style={styles.maisTexto}>+</Text>
          </View>
        </Pressable>
        {item("modules", "Aplicativos", "square.grid.2x2.fill")}
        {item("profile", "Mais", "person.crop.circle.fill")}
      </View>
    </>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <Barra {...props} />}
      screenOptions={{ headerShown: false, animation: "fade", lazy: true, freezeOnBlur: true }}
    >
      <Tabs.Screen name="index" options={{ title: "Início" }} />
      <Tabs.Screen name="notices" options={{ title: "Avisos" }} />
      <Tabs.Screen name="modules" options={{ title: "Aplicativos" }} />
      <Tabs.Screen name="profile" options={{ title: "Mais" }} />
      <Tabs.Screen name="management" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 6,
    backgroundColor: C.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D9D9DE",
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48 },
  rotulo: { fontSize: 10.5, fontWeight: "600", marginTop: 3 },
  mais: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginTop: -20,
    backgroundColor: C.dark,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.dark,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  maisTexto: { color: C.paper, fontSize: 30, lineHeight: 32, fontWeight: "400" },
  badge: {
    position: "absolute",
    top: -5,
    right: -11,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#D24B42",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTexto: { color: "#fff", fontSize: 10, fontWeight: "800" },
  folha: {
    position: "absolute",
    left: 12,
    right: 12,
    backgroundColor: C.paper,
    borderRadius: 20,
    padding: 12,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  folhaTitulo: { fontSize: 13, fontWeight: "700", color: C.muted, paddingHorizontal: 8, paddingVertical: 6 },
  acao: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 14 },
  acaoIcone: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.yellow, alignItems: "center", justifyContent: "center" },
  acaoTitulo: { fontSize: 15, fontWeight: "700", color: C.ink },
  acaoDetalhe: { fontSize: 12, color: C.muted },
});
