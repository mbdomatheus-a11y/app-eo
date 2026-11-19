// Busca fixa no topo (Fundação, especificação de 19/11/2026): digitar o nome de um módulo abre o módulo.
// Só aparecem módulos liberados para a conta e para a empresa.
import { useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Group, MenuItem } from "../design";
import { useEO } from "../providers/eo-provider";
import { AppIcon, C, Page, s } from "../ui";
import { buscarModulos } from "./module-catalog";

export function ModuleSearch({ children }: { children: ReactNode }) {
  const app = useEO();
  const [consulta, setConsulta] = useState("");
  const resultados = buscarModulos(consulta, app.moduleVisible);
  const abrir = (rota: string) => {
    setConsulta("");
    router.push(rota as never);
  };
  return (
    <>
      <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }}>
          <AppIcon name="magnifyingglass" size={18} color={C.muted} />
          <TextInput
            value={consulta}
            onChangeText={setConsulta}
            placeholder="Buscar módulo"
            placeholderTextColor={C.lightMuted}
            accessibilityLabel="Buscar módulo"
            returnKeyType="go"
            autoCorrect={false}
            onSubmitEditing={() => resultados[0] && abrir(resultados[0].rota)}
            style={{ flex: 1, fontSize: 16, color: C.ink, paddingVertical: 10 }}
          />
          {consulta ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" hitSlop={10} onPress={() => setConsulta("")}>
              <Text style={{ color: C.muted, fontWeight: "700" }}>Limpar</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {consulta.trim() ? (
        <Page>
          {resultados.length ? (
            <Group>
              {resultados.map((m, i) => (
                <MenuItem key={m.rota} title={m.titulo} detail={m.detalhe} icon={m.icone} moduleId={m.id} last={i === resultados.length - 1} onPress={() => abrir(m.rota)} />
              ))}
            </Group>
          ) : (
            <Text style={s.small}>Nenhum módulo encontrado para "{consulta.trim()}".</Text>
          )}
        </Page>
      ) : (
        children
      )}
    </>
  );
}
