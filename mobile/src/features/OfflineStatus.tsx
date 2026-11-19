import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useEO } from "../providers/eo-provider";
import { offlineEngine } from "../services/supabase";
import { Button, Card, Page, s, C } from "../ui";

export function OfflineBanner() {
  const { offline, workspace } = useEO();
  if (
    !workspace ||
    (offline.online &&
      offline.revalidated &&
      !offline.pending &&
      !offline.failed.length)
  )
    return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ver sincronização"
      onPress={() => router.navigate("/sync" as never)}
      style={{
        padding: 10,
        marginHorizontal: 14,
        borderRadius: 12,
        backgroundColor: C.yellow,
      }}
    >
      <Text style={{ color: C.dark, fontSize: 12, fontWeight: "600" }}>
        {!offline.online || !offline.revalidated
          ? "Dados locais"
          : "Sincronização"}{" "}
        · {offline.pending} pendente(s)
        {offline.failed.length
          ? ` · ${offline.failed.length} precisa(m) de revisão`
          : ""}
        . Ver detalhes
      </Text>
    </Pressable>
  );
}
export function OfflineScreen() {
  const app = useEO();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState<string | null>(null);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível sincronizar.",
      );
    } finally {
      setBusy(false);
    }
  };
  const names: Record<string, string> = {
    eo_save_day_entry: "Ocorrências do Dia",
    eo_save_mood: "Como está o seu dia?",
    eo_save_product_request: "Pedido de produto",
    eo_notice_open: "Abertura de comunicado",
    eo_acknowledge: "Ciência de comunicado",
    eo_checklist_save: "Resposta de checklist",
  };
  return (
    <Page>
      <Text style={s.title}>Sincronização</Text>
      <Card>
        <Text style={s.body}>
          {app.offline.online && app.offline.revalidated
            ? "Conexão e acesso confirmados"
            : "Usando dados guardados neste aparelho"}
        </Text>
        <Text style={s.detail}>
          Há {app.offline.pending} envio(s) pendente(s) e{" "}
          {app.offline.failed.length} com erro. A consulta offline usa
          informações carregadas nas últimas 24 horas. Textos do diário,
          sentimento, pedidos, ciência e respostas simples de checklist ficam na
          fila. Fotos, áudio, IA, administração e o primeiro acesso precisam de
          conexão.
        </Text>
        <Button
          title={
            busy || app.offline.syncing
              ? "Sincronizando…"
              : "Conectar e sincronizar agora"
          }
          disabled={busy || app.offline.syncing}
          onPress={() => void run(app.synchronize)}
        />
        {!!app.offline.lastError && (
          <Text style={s.detail}>{app.offline.lastError}</Text>
        )}
        {!!error && (
          <Text accessibilityLiveRegion="polite" style={s.detail}>
            {error}
          </Text>
        )}
      </Card>
      {app.offline.items.map((item) => (
        <Card key={item.id}>
          <Text style={s.body}>{names[item.name] ?? "Registro"}</Text>
          <Text style={s.small}>
            {new Date(item.createdAt).toLocaleString("pt-BR")} · {item.attempts}{" "}
            tentativa(s)
          </Text>
          <Text style={s.detail}>{item.error}</Text>
          <Text style={s.small}>
            {item.state === "failed"
              ? "Precisa de revisão"
              : "Aguardando envio"}{" "}
            · {item.id.slice(0, 8)}
          </Text>
          <Button
            title="Tentar novamente"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await app.synchronize();
                await offlineEngine.retry(item.id);
              })
            }
          />
          {confirm === item.id ? (
            <>
              <Text style={s.detail}>
                Descartar remove este envio do aparelho. Não apaga registros já
                enviados ao servidor.
              </Text>
              <Button
                title="Confirmar descarte"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await offlineEngine.discard(item.id);
                    setConfirm(null);
                  })
                }
              />
              <Button
                secondary
                title="Manter registro"
                onPress={() => setConfirm(null)}
              />
            </>
          ) : (
            <Button
              secondary
              title="Descartar pendência"
              disabled={busy}
              onPress={() => setConfirm(item.id)}
            />
          )}
        </Card>
      ))}
    </Page>
  );
}
