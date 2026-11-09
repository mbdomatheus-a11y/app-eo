import { useEffect, useState } from "react";
import { Text } from "react-native";
import { rpc } from "../services/supabase";
import { Card, s } from "../ui";
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
                "Não foi possível conferir o horário. Conte de manhã, antes da abertura: vendas podem causar divergências.",
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
  return storeId && data ? (
    <Card>
      <Text accessibilityRole="alert" style={s.body}>
        {data.warning ||
          "Dentro da manhã e antes do horário de abertura cadastrado."}
      </Text>
      <Text style={s.small}>
        {data.timezone}
        {data.opens ? ` · Abertura ${data.opens}` : ""}. Horário e alerta ficam
        registrados em cada leitura e salvamento.
      </Text>
    </Card>
  ) : null;
}
