import { useEffect, useState } from "react";
import { Text } from "react-native";
import * as SecureStore from "expo-secure-store";
import { rpc } from "../services/supabase";
import { Button, Card, s } from "../ui";
type PromptState = {
  due: boolean;
  answered: boolean;
  date: string;
  prompt: string;
};
export function MoodReminderBanner({
  userId,
  onRespond,
}: {
  userId: string;
  onRespond: () => void;
}) {
  const [state, setState] = useState<PromptState | null>(null);
  const [deferred, setDeferred] = useState(0);
  const key = `eo.mood.defer.${userId}`;
  useEffect(() => {
    void SecureStore.getItemAsync(key).then((v) => setDeferred(Number(v || 0)));
    const load = () =>
      void rpc<PromptState>("eo_mood_prompt_state")
        .then(setState)
        .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [key]);
  if (!state?.due || deferred > Date.now()) return null;
  return (
    <Card>
      <Text style={s.strong}>{state.prompt}</Text>
      <Text style={s.small}>Conte como está seu dia quando puder.</Text>
      <Button title="Responder" onPress={onRespond} />
      <Button
        secondary
        title="Adiar 30 minutos"
        onPress={() => {
          const until = Date.now() + 30 * 60000;
          void SecureStore.setItemAsync(key, String(until));
          setDeferred(until);
        }}
      />
    </Card>
  );
}
