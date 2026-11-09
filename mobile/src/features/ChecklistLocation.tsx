import { useState } from "react";
import * as Location from "expo-location";
import { Text, View } from "react-native";
import { rpc } from "../services/supabase";
import { Button, s } from "../ui";
export function ChecklistLocation({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function capture(consent: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      if (!consent)
        await rpc("eo_record_checklist_location", {
          p_run: runId,
          p_consent: false,
        });
      else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          setMessage(
            "Permissão não concedida. Você pode continuar normalmente.",
          );
          return;
        }
        const position = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 15000),
          ),
        ]);
        if (position.coords.accuracy == null)
          throw new Error("Precisão não informada pelo aparelho");
        await rpc("eo_record_checklist_location", {
          p_run: runId,
          p_consent: true,
          p_lat: position.coords.latitude,
          p_lon: position.coords.longitude,
          p_accuracy: position.coords.accuracy,
        });
      }
      setMessage(
        consent
          ? "Localização registrada, sem bloqueio por distância."
          : "Preferência registrada. Continue sem compartilhar localização.",
      );
    } catch {
      setMessage(
        "Localização indisponível. Você pode continuar e tentar novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>Localização opcional</Text>
      <Text style={s.small}>
        Se autorizar, posição, precisão e horário ficam registrados neste
        checklist. Sem acompanhamento em segundo plano nem bloqueio por
        distância.
      </Text>
      <Button
        title="Permitir e registrar localização"
        secondary
        disabled={busy}
        onPress={() => void capture(true)}
      />
      <Button
        title="Continuar sem localização"
        secondary
        disabled={busy}
        onPress={() => void capture(false)}
      />
      {!!message && (
        <Text accessibilityRole="alert" style={s.small}>
          {message}
        </Text>
      )}
    </View>
  );
}
