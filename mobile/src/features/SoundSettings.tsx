import { useEffect, useState } from "react";
import { Text } from "react-native";
import { rpc } from "../services/supabase";
import { Button, Card, Choice, Heading, s } from "../ui";
import { soundOptions } from "./notification-sound";
import { SuccessToast } from "./SuccessToast";
export function SoundSettings() {
  const [sound, setSound] = useState("default"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void rpc<{ sound: string }>("eo_notification_sound")
      .then((r) => setSound(r.sound))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <Card>
      <Heading title="Som padrão dos avisos" />
      <Text style={s.small}>
        Preferências individuais e ajustes de Foco, volume e notificações do
        aparelho continuam valendo.
      </Text>
      {soundOptions.map((option) => (
        <Choice
          key={option.value}
          label={option.label}
          selected={sound === option.value}
          onPress={() => setSound(option.value)}
        />
      ))}
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      <SuccessToast message={message} />
      <Button
        title="Salvar som padrão"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setError("");
          setMessage("");
          try {
            await rpc("eo_notification_sound", { p_sound: sound });
            setMessage("Som padrão atualizado.");
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}
