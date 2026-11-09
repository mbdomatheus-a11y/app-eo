import { useEffect, useState } from "react";
export function SuccessToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(Boolean(message));
    if (!message) return;
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  if (!visible) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        zIndex: 300,
        bottom: "max(84px, env(safe-area-inset-bottom))",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(440px, calc(100vw - 32px))",
        padding: "14px 18px",
        borderRadius: 16,
        background: "#4A4E58",
        color: "#FEFEFE",
        boxShadow: "0 8px 32px #0003",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Fechar confirmação"
        style={{ color: "inherit", background: "transparent", border: 0 }}
      >
        ✕
      </button>
    </div>
  );
}
