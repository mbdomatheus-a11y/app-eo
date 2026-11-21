// Administração das fotos do novo visual (21/11/2026). Só administradores.
// Envia a foto ao bucket público eo-aparencia e grava a troca por eo_admin_set_aparencia_foto.
import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { rawRpc, supabase } from "../services/supabase";
import { C, s } from "../ui";
import { BUCKET_APARENCIA, ESPACOS, useAparencia, useFoto, type EspacoFoto } from "./aparencia";

type Posicao = "top" | "center" | "bottom";
const POSICOES: [Posicao, string][] = [
  ["top", "Topo"],
  ["center", "Centro"],
  ["bottom", "Base"],
];

function Linha({ id, titulo, onde }: { id: EspacoFoto; titulo: string; onde: string }) {
  const { trocas, definir } = useAparencia();
  const foto = useFoto(id);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const salvar = async (caminho: string | null, posicao: Posicao) => {
    const r = await rawRpc<Parameters<typeof definir>[0]>("eo_admin_set_aparencia_foto", {
      p_espaco: id,
      p_caminho: caminho,
      p_posicao: posicao,
    });
    definir(r ?? {});
  };

  const trocar = async () => {
    setErro("");
    try {
      const escolha = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      if (escolha.canceled || !escolha.assets?.[0]) return;
      setOcupado(true);
      const arquivo = escolha.assets[0];
      const tipo = arquivo.mimeType && ["image/jpeg", "image/png", "image/webp"].includes(arquivo.mimeType) ? arquivo.mimeType : "image/jpeg";
      const ext = tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
      const resposta = await fetch(arquivo.uri);
      const bytes = await resposta.arrayBuffer();
      if (!bytes.byteLength) throw new Error("Não foi possível ler a foto.");
      if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Use uma foto de até 5 MB.");
      if (!supabase) throw new Error("Conexão indisponível.");
      const caminho = `${id}/${randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_APARENCIA).upload(caminho, bytes, { contentType: tipo, upsert: false });
      if (error) throw error;
      await salvar(caminho, trocas[id]?.posicao ?? "center");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível trocar a foto.");
    } finally {
      setOcupado(false);
    }
  };

  const executar = async (acao: () => Promise<void>) => {
    setErro("");
    setOcupado(true);
    try {
      await acao();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setOcupado(false);
    }
  };

  const troca = trocas[id];
  return (
    <View style={a.linha}>
      <Image source={foto.fonte} style={a.miniatura} resizeMode="cover" />
      <View style={{ flex: 1, gap: 6, minWidth: 200 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={s.strong}>{titulo}</Text>
          <Text style={[a.tag, troca ? a.tagTrocada : null]}>{troca ? "Personalizada" : "Padrão"}</Text>
        </View>
        <Text style={s.small}>{onde}</Text>
        {troca && (
          <View style={a.posicoes}>
            {POSICOES.map(([p, rotulo]) => (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityState={{ selected: troca.posicao === p }}
                disabled={ocupado}
                onPress={() => void executar(() => salvar(troca.caminho, p))}
                style={[a.posicao, troca.posicao === p && a.posicaoAtiva]}
              >
                <Text style={[a.posicaoTexto, troca.posicao === p && { color: C.paper }]}>{rotulo}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Pressable accessibilityRole="button" disabled={ocupado} onPress={() => void trocar()} style={({ pressed }) => [a.botao, pressed && { opacity: 0.7 }]}>
            <Text style={a.botaoTexto}>Trocar foto</Text>
          </Pressable>
          {troca && (
            <Pressable
              accessibilityRole="button"
              disabled={ocupado}
              onPress={() => void executar(() => salvar(null, "center"))}
              style={({ pressed }) => [a.botaoClaro, pressed && { opacity: 0.7 }]}
            >
              <Text style={a.botaoClaroTexto}>Voltar ao padrão</Text>
            </Pressable>
          )}
          {ocupado && <ActivityIndicator color={C.dark} />}
        </View>
        {!!erro && <Text style={{ color: C.red, fontSize: 14 }}>{erro}</Text>}
      </View>
    </View>
  );
}

export function AparenciaAdmin() {
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.detail}>
        Troque as fotos do login, do Início, das capas dos módulos e das telas vazias. Use fotos horizontais, de até 5 MB, sem
        rostos de clientes identificáveis sem autorização. A mudança aparece no app e no site na próxima abertura.
      </Text>
      <View style={a.grupo}>
        {ESPACOS.map((e, i) => (
          <View key={e.id} style={i ? a.separador : null}>
            <Linha id={e.id} titulo={e.titulo} onde={e.onde} />
          </View>
        ))}
      </View>
    </View>
  );
}

const a = StyleSheet.create({
  grupo: {
    backgroundColor: C.paper,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  separador: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  linha: { flexDirection: "row", flexWrap: "wrap", gap: 14, padding: 14, alignItems: "flex-start" },
  miniatura: { width: 132, height: 76, borderRadius: 12, backgroundColor: C.fill },
  tag: { fontSize: 12, fontWeight: "600", color: C.muted, backgroundColor: C.fill, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  tagTrocada: { color: C.dark, backgroundColor: C.yellow },
  posicoes: { flexDirection: "row", backgroundColor: C.fill, borderRadius: 10, padding: 2, alignSelf: "flex-start" },
  posicao: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  posicaoAtiva: { backgroundColor: C.dark },
  posicaoTexto: { fontSize: 13, fontWeight: "600", color: C.ink },
  botao: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.dark },
  botaoTexto: { color: C.paper, fontSize: 14, fontWeight: "600" },
  botaoClaro: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.fill },
  botaoClaroTexto: { color: C.ink, fontSize: 14, fontWeight: "600" },
});
