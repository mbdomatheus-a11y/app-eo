import { useEffect, useState } from "react";
import { rpc } from "../../services/supabase";
export function AssortmentTiming({ storeId }: { storeId: string }) {
  const [data, setData] = useState<{
    warning: string | null;
    timezone: string;
    opens: string | null;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    if (!storeId) return;
    const load = () =>
      void rpc<typeof data>("eo_assortment_timing", { p_store: storeId })
        .then((r) => {
          if (alive) setData(r);
        })
        .catch(() => {
          if (alive)
            setData({
              warning:
                "Não foi possível conferir o horário. Prefira contar de manhã, antes da abertura: vendas podem causar divergências.",
              timezone: "",
              opens: null,
            });
        });
    load();
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [storeId]);
  if (!storeId || !data) return null;
  return (
    <aside
      role={data.warning ? "alert" : "status"}
      className={data.warning ? "info-strip" : "field-hint"}
    >
      {data.warning ||
        "Dentro da manhã e antes do horário de abertura cadastrado."}
      {data.timezone && (
        <small style={{ display: "block" }}>
          Fuso: {data.timezone}
          {data.opens ? ` · Abertura: ${data.opens}` : ""}. O horário e o alerta
          são registrados com cada leitura e salvamento.
        </small>
      )}
    </aside>
  );
}
