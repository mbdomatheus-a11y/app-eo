import { Redirect } from "expo-router";
import { HomeRoute } from "../../navigation/route-screens";
import { useEO } from "../../providers/eo-provider";
import { LoadingScreen } from "../../../App";
import { RouteFrame } from "../../navigation/route-screens";

export default function Home() {
  const app = useEO();
  if (app.initializing) return <RouteFrame noHeader><LoadingScreen configured={app.configured} error={app.error} /></RouteFrame>;
  if (!app.session) return <Redirect href="/login" />;
  if (app.passwordMode) return <Redirect href="/change-password" />;
  if (!app.workspace) return <Redirect href="/access" />;
  return <HomeRoute />;
}
