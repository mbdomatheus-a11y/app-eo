import { useEffect, useState, useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

type MoodState = { until: number; answeredDate: string | null };
const values = new Map<string, MoodState>();
const listeners = new Map<string, Set<() => void>>();
const keyFor = (userId: string) => `eo.mood.defer.${userId}`;

function publish(userId: string, value: MoodState) {
  values.set(userId, value);
  listeners.get(userId)?.forEach((listener) => listener());
}

function readValue(raw: string | null): MoodState {
  if (!raw) return { until: 0, answeredDate: null };
  try {
    const value = JSON.parse(raw) as Partial<MoodState>;
    return {
      until: typeof value.until === "number" ? value.until : 0,
      answeredDate: typeof value.answeredDate === "string" ? value.answeredDate : null,
    };
  } catch {
    return { until: Number(raw) || 0, answeredDate: null };
  }
}

export function useMoodDeferral(userId: string | undefined) {
  const value = useSyncExternalStore(
    (listener) => {
      if (!userId) return () => {};
      let group = listeners.get(userId);
      if (!group) listeners.set(userId, (group = new Set()));
      group.add(listener);
      return () => group?.delete(listener);
    },
    () => (userId ? (values.get(userId) ?? null) : null),
    () => null,
  );
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!userId) return;
    if (!values.has(userId)) {
      void SecureStore.getItemAsync(keyFor(userId))
        .then((raw) => {
          if (!values.has(userId)) publish(userId, readValue(raw));
        })
        .catch(() => {
          if (!values.has(userId)) publish(userId, readValue(null));
        });
    }
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [userId]);
  return {
    loaded: value !== null,
    deferred: value !== null && value.until > now,
    answeredDate: value?.answeredDate ?? null,
  };
}

export function deferMood(userId: string, minutes: number) {
  const value: MoodState = {
    until: Date.now() + minutes * 60_000,
    answeredDate: values.get(userId)?.answeredDate ?? null,
  };
  publish(userId, value);
  void SecureStore.setItemAsync(keyFor(userId), JSON.stringify(value));
}

export function clearMoodReminderForToday(userId: string, date: string) {
  const value: MoodState = {
    until: values.get(userId)?.until ?? 0,
    answeredDate: date,
  };
  publish(userId, value);
  void SecureStore.setItemAsync(keyFor(userId), JSON.stringify(value));
}
