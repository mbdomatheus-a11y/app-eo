import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
const listeners = new Set<(message: string) => void>();
export function SuccessToast({ message }: { message: string }) {
  useEffect(() => {
    if (message) for (const listener of listeners) listener(message);
  }, [message]);
  return null;
}
export function SuccessToastHost({ bottom = 24 }: { bottom?: number }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    listeners.add(setMessage);
    return () => {
      listeners.delete(setMessage);
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  return message ? (
    <Pressable
      accessibilityRole="alert"
      accessibilityLabel={message}
      onPress={() => setMessage("")}
      style={{
        position: "absolute",
        zIndex: 100,
        elevation: 10,
        bottom,
        left: 16,
        right: 16,
        backgroundColor: "#4A4E58",
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Text numberOfLines={6} style={{ color: "#FEFEFE", fontSize: 15 }}>
        {message}
      </Text>
    </Pressable>
  ) : null;
}
