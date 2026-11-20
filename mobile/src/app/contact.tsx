// Contato e horário da unidade em tela própria (19/11/2026): a aba Mais fica só com o menu.
import { PersonalSettings } from "../features/PersonalSettings";
import { RouteFrame } from "../navigation/route-screens";
import { useEO } from "../providers/eo-provider";
import { Page } from "../ui";

export default function ContactScreen() {
  const app = useEO();
  if (!app.workspace) return null;
  return (
    <RouteFrame>
      <Page>
        <PersonalSettings stores={app.workspace.stores} role={app.workspace.person.role} />
      </Page>
    </RouteFrame>
  );
}
