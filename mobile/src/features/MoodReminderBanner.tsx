import { useEffect, useState } from "react";
import { Text } from "react-native";
import { rpc } from "../services/supabase";
import { Button, Card, s } from "../ui";
import { deferMood, useMoodDeferral } from "./mood-deferral";
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
  const deferral = useMoodDeferral(userId);
  useEffect(() => {
    const load = () =>
      void rpc<PromptState>("eo_mood_prompt_state")
        .then(setState)
        .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [userId]);
  if (!state?.due || !deferral.loaded || deferral.deferred || deferral.answeredDate === state.date) return null;
  return (
    <Card>
      <Text style={s.strong}>{state.prompt}</Text>
      <Text style={s.small}>Conte como está seu dia quando puder.</Text>
      <Button title="Responder" onPress={onRespond} />
      <Button
        secondary
        title="Adiar 30 minutos"
        onPress={() => {
          deferMood(userId, 30);
        }}
      />
    </Card>
  );
}
