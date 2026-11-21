// Aparência e fotos (21/11/2026): só administradores.
import { Redirect } from "expo-router";
import { AparenciaAdmin } from "../features/AparenciaAdmin";
import { RouteFrame } from "../navigation/route-screens";
import { useEO } from "../providers/eo-provider";
import { Page } from "../ui";

export default function AppearanceScreen() {
  const app = useEO();
  if (!app.workspace) return null;
  if (app.workspace.person.role !== "admin") return <Redirect href="/" />;
  return (
    <RouteFrame>
      <Page>
        <AparenciaAdmin />
      </Page>
    </RouteFrame>
  );
}
