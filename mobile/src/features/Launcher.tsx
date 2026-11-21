// Navegação em blocos (19/11/2026, pedido de Matheus para melhorar menus e botões).
// Grade de módulos com alvos grandes, cartões de pendência com número em destaque e cor por grupo.
import { Pressable, StyleSheet, Text, View, Platform, useWindowDimensions } from "react-native";
import { AppIcon, C } from "../ui";

export const CORES_GRUPO: Record<string, { cor: string; fundo: string }> = {
  "Pessoas e rotina": { cor: "#4E7C68", fundo: "#ECF5EF" },
  "Vendas e comercial": { cor: "#587C9D", fundo: "#EAF2FA" },
  Execução: { cor: "#B87C4F", fundo: "#FCF0E6" },
};
const PADRAO = { cor: C.dark, fundo: "#F0F0F3" };

export type Bloco = { chave: string; titulo: string; icone: string; moduleId?: string; grupo?: string; badge?: number; abrir: () => void };

export function GradeBlocos({ itens }: { itens: Bloco[] }) {
  // Na tela larga do site os blocos têm largura fixa; no celular, três por linha.
  const { width } = useWindowDimensions();
  const largo = Platform.OS === "web" && width >= 700;
  return (
    <View style={e.grade}>
      {itens.map((b) => {
        const tom = (b.grupo && CORES_GRUPO[b.grupo]) || PADRAO;
        return (
          <Pressable
            key={b.chave}
            accessibilityRole="button"
            accessibilityLabel={b.badge ? `${b.titulo}, ${b.badge} pendentes` : b.titulo}
            onPress={b.abrir}
            style={({ pressed }) => [e.bloco, largo && { width: 160 }, pressed && e.pressionado]}
          >
            <View style={[e.icone, { backgroundColor: tom.fundo }]}>
              <AppIcon name={b.icone} moduleId={b.moduleId} size={24} color={tom.cor} />
              {b.badge ? (
                <View style={e.badge}>
                  <Text style={e.badgeTexto}>{b.badge > 99 ? "99+" : b.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={2} style={e.titulo}>
              {b.titulo}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type Pendencia = { chave: string; numero: number; rotulo: string; vazio: string; abrir: () => void };

export function CartoesPendencia({ itens }: { itens: Pendencia[] }) {
  return (
    <View style={e.linha}>
      {itens.map((p) => {
        const tem = p.numero > 0;
        return (
          <Pressable
            key={p.chave}
            accessibilityRole="button"
            accessibilityLabel={tem ? `${p.numero} ${p.rotulo}` : p.vazio}
            onPress={p.abrir}
            style={({ pressed }) => [e.cartao, tem && e.cartaoAtivo, pressed && e.pressionado]}
          >
            <Text style={[e.numero, !tem && { color: C.lightMuted }]}>{tem ? (p.numero > 99 ? "99+" : p.numero) : "✓"}</Text>
            <Text numberOfLines={2} style={e.rotulo}>
              {tem ? p.rotulo : p.vazio}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const e = StyleSheet.create({
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  bloco: {
    width: "31%",
    minHeight: 108,
    backgroundColor: C.paper,
    borderRadius: 20,
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  icone: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  titulo: { color: C.ink, fontSize: 14, lineHeight: 18, fontWeight: "600", letterSpacing: -0.2 },
  badge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: "#D24B42",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: C.paper,
  },
  badgeTexto: { color: "#fff", fontSize: 10, fontWeight: "800" },
  linha: { flexDirection: "row", gap: 10 },
  cartao: {
    flex: 1,
    minHeight: 92,
    backgroundColor: C.paper,
    borderRadius: 20,
    padding: 14,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cartaoAtivo: { backgroundColor: C.yellow },
  numero: { color: C.ink, fontSize: 30, fontWeight: "700", letterSpacing: -0.8 },
  rotulo: { color: C.dark, fontSize: 12.5, lineHeight: 16, fontWeight: "600" },
  pressionado: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
