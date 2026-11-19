// Cartão "Versão do app": versão em uso e anterior, com data e hora, para confirmar que a
// compilação ou a atualização OTA realmente chegou a este aparelho.
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Card, C, s } from "../ui";
import { dataHora, registrarVersao, type HistoricoVersao, type VersaoApp } from "./app-version";

export function useHistoricoVersao() {
  const [historico, setHistorico] = useState<HistoricoVersao | null>(null);
  useEffect(() => {
    let ativo = true;
    void registrarVersao().then((h) => ativo && setHistorico(h));
    return () => {
      ativo = false;
    };
  }, []);
  return historico;
}

function Linhas({ v, titulo, atual }: { v: VersaoApp; titulo: string; atual: boolean }) {
  const origem =
    v.origem === "atualizacao" ? "Atualização OTA" : v.origem === "instalacao" ? "Instalação (sem OTA)" : "Desenvolvimento";
  const linha = (rotulo: string, valor: string) => (
    <Text style={s.small}>
      <Text style={{ fontWeight: "700", color: C.ink }}>{rotulo}: </Text>
      {valor}
    </Text>
  );
  return (
    <View style={{ gap: 2, paddingVertical: 6 }}>
      <Text style={{ color: atual ? C.green : C.muted, fontWeight: "800" }}>{titulo}</Text>
      {linha("Versão", `${v.versao}${v.compilacao ? ` · compilação ${v.compilacao}` : ""}`)}
      {linha("Origem", origem)}
      {linha(v.origem === "atualizacao" ? "Publicada em" : "Gerada em", dataHora(v.publicadaEm))}
      {linha(atual ? "Em uso desde" : "Usada a partir de", dataHora(v.vistaDesde))}
      {v.commit ? linha("Código", v.commit) : null}
      {linha("Atualização", v.updateId ? v.updateId.slice(0, 8) : "não informada")}
      {linha("Runtime", v.runtime ? v.runtime.slice(0, 12) : "não informado")}
    </View>
  );
}

export function AppVersionCard() {
  const historico = useHistoricoVersao();
  if (!historico) return null;
  return (
    <Card>
      <Text style={{ color: C.ink, fontWeight: "800", fontSize: 16 }}>Versão do app</Text>
      <Text style={s.small}>
        Depois de atualizar, confira se a versão atual mudou e se a data de publicação é a esperada.
      </Text>
      <Linhas v={historico.atual} titulo="Atual" atual />
      {historico.anterior ? (
        <Linhas v={historico.anterior} titulo="Anterior" atual={false} />
      ) : (
        <Text style={s.small}>Anterior: ainda não registrada neste aparelho. Ela aparece a partir da próxima atualização.</Text>
      )}
    </Card>
  );
}
