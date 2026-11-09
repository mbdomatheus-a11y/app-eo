import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useEO } from "../../providers/eo-provider";
import { C } from "../../ui";

export default function TabLayout() {
  const app = useEO();
  const pending = app.notices.filter((item) => !item.acknowledged).length;
  return (
    <NativeTabs
      tintColor={C.dark}
      backgroundColor={C.paper}
      badgeBackgroundColor="#D24B42"
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Início</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          md="home"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="notices"
        hidden={!app.moduleVisible("notices")}
        disableAutomaticContentInsets
      >
        <NativeTabs.Trigger.Label>Avisos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "bell", selected: "bell.fill" }}
          md="notifications"
        />
        {pending > 0 && (
          <NativeTabs.Trigger.Badge>{String(pending)}</NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="modules" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Explorar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          md="apps"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="management"
        hidden={app.workspace?.person.role !== "admin"}
        disableAutomaticContentInsets
      >
        <NativeTabs.Trigger.Label>Gestão</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "slider.horizontal.3",
            selected: "slider.horizontal.3",
          }}
          md="tune"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "person.crop.circle",
            selected: "person.crop.circle.fill",
          }}
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
