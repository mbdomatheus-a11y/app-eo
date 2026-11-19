// Indicador discreto de salvamento (Fundação, especificação 19/11/2026, seção 2):
// sem pop-up; uma linha curta com "Salvando…", "Salvo às hh:mm", "Salvo no aparelho" ou o erro.
import { Pressable, Text } from "react-native";
import { C, s } from "../ui";

export type EstadoSalvo =
  | { estado: "salvando" }
  | { estado: "salvo"; em: string }
  | { estado: "pendente"; em: string } // gravado no aparelho, envia quando a internet voltar
  | { estado: "aguardando"; mensagem: string } // ainda não dá para salvar (ex.: mínimo de caracteres)
  | { estado: "erro"; mensagem: string };

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function SaveStatus({ valor, tentarDeNovo }: { valor?: EstadoSalvo; tentarDeNovo?: () => void }) {
  if (!valor) return null;
  const [texto, cor] =
    valor.estado === "salvando"
      ? ["Salvando…", C.muted]
      : valor.estado === "salvo"
        ? [`✓ Salvo às ${hora(valor.em)}`, C.green]
        : valor.estado === "pendente"
          ? [`Salvo no aparelho às ${hora(valor.em)} · envia quando a internet voltar`, C.muted]
          : valor.estado === "aguardando"
            ? [valor.mensagem, C.muted]
            : [`Não salvo: ${valor.mensagem}`, C.red];
  return (
    <Pressable
      accessibilityLiveRegion="polite"
      accessibilityRole={valor.estado === "erro" && tentarDeNovo ? "button" : "text"}
      disabled={!(valor.estado === "erro" && tentarDeNovo)}
      onPress={tentarDeNovo}
      hitSlop={6}
    >
      <Text style={[s.small, { color: cor }]}>
        {texto}
        {valor.estado === "erro" && tentarDeNovo ? " · tocar para tentar de novo" : ""}
      </Text>
    </Pressable>
  );
}
