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
import { ATALHOS, MODULOS, acaoPrincipal } from "../../features/module-catalog";
import { useTelaLarga } from "../../navigation/Sidebar";

type Acao = { id: string; titulo: string; detalhe: string; icone: string; rota: string; principal?: boolean };
// Menu do botão central (19/11/2026): primeiro a ação principal do contexto (especificação), depois os
// módulos mais usados do catálogo único. O menu foi mantido a pedido de Matheus (18/11/2026).
const ORDEM_MENU = [...ATALHOS, "/mood", "/assortment", "/agenda"];
function montarAcoes(aba: string, papel: string, visivel: (id: string) => boolean): Acao[] {
  const principal = acaoPrincipal(aba, papel, visivel);
  const lista: Acao[] = principal
    ? [{ id: principal.modulo, titulo: principal.titulo, detalhe: principal.detalhe, icone: principal.icone, rota: principal.rota, principal: true }]
    : [];
  for (const rota of ORDEM_MENU) {
    const m = MODULOS.find((x) => x.rota === rota);
    if (m && visivel(m.id) && !lista.some((x) => x.rota === m.rota))
      lista.push({ id: m.id, titulo: m.titulo, detalhe: m.detalhe, icone: m.icone, rota: m.rota });
  }
  return lista;
}

function AcoesRapidas({ aberto, fechar, embaixo, aba }: { aberto: boolean; fechar: () => void; embaixo: number; aba: string }) {
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
  const visiveis = montarAcoes(aba, app.workspace?.person.role ?? "colaborador", app.moduleVisible);
  const principal = visiveis.find((a) => a.principal);
  const outras = visiveis.filter((a) => !a.principal);
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
        {principal && (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.principal, pressed && { opacity: 0.85 }]}
            onPress={() => {
              fechar();
              router.push(principal.rota as never);
            }}
          >
            <View style={styles.principalIcone}>
              <AppIcon name={principal.icone} size={22} color={C.dark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.principalTitulo}>{principal.titulo}</Text>
              <Text style={styles.principalDetalhe}>{principal.detalhe}</Text>
            </View>
          </Pressable>
        )}
        <Text style={styles.folhaTitulo}>Abrir rápido</Text>
        <View style={styles.gradeAcoes}>
          {outras.map((a) => (
            <Pressable
              key={a.rota}
              accessibilityRole="button"
              style={({ pressed }) => [styles.acaoBloco, pressed && { backgroundColor: C.canvas }]}
              onPress={() => {
                fechar();
                router.push(a.rota as never);
              }}
            >
              <View style={styles.acaoIcone}>
                <AppIcon name={a.icone} size={20} color={C.dark} />
              </View>
              <Text numberOfLines={2} style={styles.acaoTitulo}>{a.titulo}</Text>
            </Pressable>
          ))}
        </View>
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
        <View style={[styles.pilula, ativo(nome) && styles.pilulaAtiva]}>
          <AppIcon name={icone} size={23} color={cor} />
          {badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeTexto}>{badge > 99 ? "99+" : badge}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={[styles.rotulo, { color: cor }, ativo(nome) && { fontWeight: "800" }]}>
          {titulo}
        </Text>
      </Pressable>
    );
  };
  const altura = 56 + insets.bottom;
  return (
    <>
      <AcoesRapidas aberto={acoes} fechar={() => setAcoes(false)} embaixo={altura} aba={state.routes[state.index]?.name ?? "index"} />
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
          <Text numberOfLines={1} style={[styles.rotulo, { color: C.dark, fontWeight: "700" }]}>{acoes ? "Fechar" : "Ações"}</Text>
        </Pressable>
        {item("modules", "Aplicativos", "square.grid.2x2.fill")}
        {item("profile", "Mais", "person.crop.circle.fill")}
      </View>
    </>
  );
}

export default function TabLayout() {
  // No site em tela larga a navegação fica na barra lateral (Sidebar), sem barra inferior.
  const telaLarga = useTelaLarga();
  return (
    <Tabs
      tabBar={(props) => (telaLarga ? null : <Barra {...props} />)}
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
    top: -3,
    right: 4,
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
  pilula: { paddingHorizontal: 18, paddingVertical: 4, borderRadius: 16 },
  pilulaAtiva: { backgroundColor: C.fill },
  principal: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.dark, marginBottom: 6 },
  principalIcone: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.yellow, alignItems: "center", justifyContent: "center" },
  principalTitulo: { fontSize: 16, fontWeight: "800", color: C.paper },
  principalDetalhe: { fontSize: 12.5, color: "#D9DAE0" },
  gradeAcoes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  acaoBloco: { width: "31.5%", minHeight: 92, padding: 10, borderRadius: 16, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: "#E5E6EB" },
  acaoIcone: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.yellow, alignItems: "center", justifyContent: "center" },
  acaoTitulo: { fontSize: 13, lineHeight: 16, fontWeight: "700", color: C.ink },
  acaoDetalhe: { fontSize: 12, color: C.muted },
});
