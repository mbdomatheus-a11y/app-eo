import { useState } from "react";
export function StorageNotice() {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem("eo-storage-notice-v1") !== "seen";
    } catch {
      return true;
    }
  });
  if (!visible) return null;
  return (
    <aside
      aria-label="Privacidade e armazenamento"
      style={{
        position: "fixed",
        bottom: 12,
        left: 12,
        right: 12,
        maxWidth: 540,
        zIndex: 250,
        background: "#FEFEFE",
        color: "#4A4E58",
        border: "1px solid #DDDAD5",
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 4px 24px #0002",
        fontSize: 14,
      }}
    >
      <p style={{ margin: "0 0 10px" }}>
        Usamos armazenamento necessário para sua sessão e preferências. Sem
        cookies de publicidade ou análise opcional nesta versão.
      </p>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <a href="/privacidade.html">Privacidade</a>
        <a href="/termos.html">Termos de uso</a>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem("eo-storage-notice-v1", "seen");
            } catch {}
            setVisible(false);
          }}
        >
          Entendi
        </button>
      </div>
    </aside>
  );
}
