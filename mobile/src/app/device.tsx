import Constants from "expo-constants";
import {
  createSoundChannels,
  soundChannel,
} from "../features/notification-sound";
import { rpc } from "../services/supabase";
import { SoundSettings } from "../features/SoundSettings";
import { useState } from "react";
import { Alert, Image, Linking, Platform, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { createEventInCalendarAsync } from "expo-calendar/legacy";
import * as Updates from "expo-updates";
import { RouteFrame } from "../navigation/route-screens";
import { useEO } from "../providers/eo-provider";
import {
  ActionRow,
  Badge,
  Button,
  C,
  Card,
  Field,
  Page,
  Section,
  s,
} from "../ui";

export default function DeviceScreen() {
  const app = useEO();
  const [photo, setPhoto] = useState<string>();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      Alert.alert(
        "Não foi possível concluir",
        error instanceof Error ? error.message : "Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  };
  const camera = () =>
    run(async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Câmera desativada",
          "Autorize a câmera nos ajustes do aparelho.",
          [
            { text: "Agora não" },
            {
              text: "Abrir ajustes",
              onPress: () => void Linking.openSettings(),
            },
          ],
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.75,
      });
      if (!result.canceled) setPhoto(result.assets[0].uri);
    });
  const calendar = () =>
    run(async () => {
      const startDate = new Date(Date.now() + 3600000);
      await createEventInCalendarAsync({
        title: "Rotina EO",
        notes: "Lembrete criado pelo EO",
        startDate,
        endDate: new Date(startDate.getTime() + 1800000),
      });
    });
  const localNotice = () =>
    run(async () => {
      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) {
        await app.enablePush();
        return;
      }
      const sound = (await rpc<{ sound: string }>("eo_notification_sound"))
        .sound;
      await createSoundChannels();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "EO • Avisos ativados",
          body: "Este é um teste local de som e banner. O teste push abaixo verifica o envio pelo servidor.",
          sound: app.soundEnabled ? sound : false,
        },
        trigger:
          Platform.OS === "android"
            ? { channelId: soundChannel(sound, app.soundEnabled) }
            : null,
      });
    });
  const update = () =>
    run(async () => {
      if (!Updates.isEnabled) {
        Alert.alert(
          "Atualizações",
          "A consulta remota fica disponível na versão instalada com atualizações configuradas.",
        );
        return;
      }
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert(
          "Tudo atualizado",
          "Você está usando a atualização compatível mais recente.",
        );
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert(
        "Atualização pronta",
        "Salve seu trabalho antes de reiniciar o EO.",
        [
          { text: "Depois" },
          { text: "Reiniciar", onPress: () => void Updates.reloadAsync() },
        ],
      );
    });
  return (
    <RouteFrame>
      <Page>
        <Text style={s.detail}>
          Recursos do seu iPhone ou Android, integrados à sua rotina. As
          permissões são solicitadas quando você usa cada função.
        </Text>
        <Section title="Avisos e alertas" />
        <Card>
          <Badge success={app.pushGranted} warning={!app.pushGranted}>
            {app.pushGranted
              ? "Permissão do iOS/Android concedida"
              : "Permissão pendente"}
          </Badge>
          <Text style={s.small}>
            {app.pushRegistered
              ? "Aparelho registrado no servidor para push."
              : "Este aparelho ainda não está registrado no servidor. Ative as notificações para concluir."}
          </Text>
          <Text style={s.body}>
            Receba orientações mesmo com o EO fechado. Som e exibição também
            dependem dos ajustes do aparelho.
          </Text>
          <Button
            title="Ativar notificações"
            disabled={busy || app.busy}
            onPress={() => void app.enablePush()}
          />
          <Button
            title="Testar som e banner neste aparelho"
            secondary
            disabled={busy}
            onPress={() => void localNotice()}
          />
          {app.workspace?.person.role === "admin" && (
            <Button
              title="Testar push pelo servidor"
              secondary
              disabled={app.busy}
              onPress={() => void app.sendTestPush()}
            />
          )}
        </Card>
        <Section title="Câmera" />
        <ActionRow
          title="Abrir câmera"
          detail="Teste de enquadramento. A foto fica apenas nesta tela."
          icon="camera.fill"
          disabled={busy}
          onPress={() => void camera()}
        />
        {photo && (
          <Card>
            <Image
              source={{ uri: photo }}
              style={{ width: "100%", height: 260, borderRadius: 16 }}
              resizeMode="contain"
              accessibilityLabel="Foto de teste capturada"
            />
            <Button
              title="Descartar foto de teste"
              secondary
              onPress={() => setPhoto(undefined)}
            />
          </Card>
        )}
        <Section title="Agenda" />
        <ActionRow
          title="Criar lembrete"
          detail="Confira os detalhes no calendário antes de salvar."
          icon="checklist"
          disabled={busy}
          onPress={() => void calendar()}
        />
        <Section title="Telefone" />
        <Card>
          <Field
            label="Telefone com DDD"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="(11) 99999-9999"
          />
          <Button
            title="Abrir discador"
            secondary
            disabled={busy}
            onPress={() =>
              void run(async () => {
                const digits = phone.replace(/\D/g, "");
                if (digits.length < 8 || digits.length > 15)
                  throw new Error("Digite um telefone válido com DDD.");
                await Linking.openURL(`tel:${digits}`);
              })
            }
          />
        </Card>
        <Section title="Preferências" />
        <ActionRow
          title="Ajustes do aparelho"
          detail="Permissões de câmera e notificações"
          icon="person.crop.circle.fill"
          onPress={() => void Linking.openSettings()}
        />
        <ActionRow
          title="Buscar atualização"
          detail="Baixa mudanças compatíveis com esta instalação"
          icon="square.grid.2x2.fill"
          disabled={busy}
          onPress={() => void update()}
        />
        <View style={{ paddingVertical: 8 }}>
          <Text style={[s.small, { color: C.muted }]}>
            EO · Versão {Constants.nativeAppVersion ?? "desenvolvimento"} ·
            Compilação {Constants.nativeBuildVersion ?? "local"}
          </Text>
          <Text style={[s.small, { color: C.muted }]}>
            Atualização interna:{" "}
            {Updates.updateId?.slice(0, 8) ?? "incluída na instalação"}
          </Text>
          <Text style={[s.small, { color: C.muted }]}>
            Ícone e assinatura push mudam somente ao instalar uma nova
            compilação pelo TestFlight. Buscar atualização não troca esses
            recursos. Runtime: {Updates.runtimeVersion ?? "Desenvolvimento"}
          </Text>
        </View>
      </Page>
    </RouteFrame>
  );
}
