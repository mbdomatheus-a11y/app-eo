import { useEffect, useState } from "react";
import { rpc } from "../../services/supabase";
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
    setDeferred(Number(sessionStorage.getItem(key) || 0));
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
    <aside className="info-strip" aria-label="Pergunta do dia">
      <strong>{state.prompt}</strong>
      <p>Conte como está seu dia quando puder.</p>
      <div className="eo-choice-row">
        <button className="primary" onClick={onRespond}>
          Responder
        </button>
        <button
          className="secondary"
          onClick={() => {
            const until = Date.now() + 30 * 60000;
            sessionStorage.setItem(key, String(until));
            setDeferred(until);
          }}
        >
          Adiar 30 minutos
        </button>
      </div>
    </aside>
  );
}
