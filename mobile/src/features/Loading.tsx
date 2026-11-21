// Estados de carregamento do app (21/11/2026), mesma regra do portal: nada abaixo de 1 s; spinner em
// pedaço da tela; esqueleto com a forma da lista quando a tela inteira espera.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AccessibilityInfo, Animated, Text, View } from "react-native";
import { C, s } from "../ui";

function useAtraso(ms: number) {
  const [visivel, setVisivel] = useState(ms === 0);
  useEffect(() => {
    if (ms === 0) return;
    const t = setTimeout(() => setVisivel(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return visivel;
}

export function Carregando({ rotulo }: { rotulo: string }) {
  if (!useAtraso(900)) return null;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={rotulo} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
      <ActivityIndicator size="small" color={C.dark} />
      <Text style={s.small}>{rotulo}</Text>
    </View>
  );
}

export function EsqueletoLista({ quantidade = 4, rotulo = "Carregando" }: { quantidade?: number; rotulo?: string }) {
  const visivel = useAtraso(300);
  const pulso = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let ativo = true;
    let laco: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduzir) => {
      if (!ativo || reduzir) return;
      laco = Animated.loop(
        Animated.sequence([
          Animated.timing(pulso, { toValue: 0.55, duration: 700, useNativeDriver: true }),
          Animated.timing(pulso, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      );
      laco.start();
    });
    return () => {
      ativo = false;
      laco?.stop();
    };
  }, [pulso]);
  if (!visivel) return null;
  const barra = (largura: string, altura: number) => (
    <View style={{ width: largura as `${number}%`, height: altura, borderRadius: 6, backgroundColor: "#E6E6E9" }} />
  );
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel={rotulo} style={{ gap: 10, opacity: pulso }}>
      {Array.from({ length: quantidade }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: C.paper }}>
          <View style={{ width: 41, height: 41, borderRadius: 13, backgroundColor: "#E6E6E9" }} />
          <View style={{ flex: 1, gap: 8 }}>
            {barra(`${55 + ((i * 17) % 30)}%`, 12)}
            {barra(`${35 + ((i * 23) % 25)}%`, 10)}
          </View>
        </View>
      ))}
    </Animated.View>
  );
}
