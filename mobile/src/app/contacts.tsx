import { Redirect } from "expo-router";
import { ContactRefreshAdmin } from "../features/ContactRefresh";
import { useEO } from "../providers/eo-provider";
import { RouteFrame } from "../navigation/route-screens";
import { Page } from "../ui";
export default function Contacts() {
  const app = useEO();
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return <RouteFrame><Page><ContactRefreshAdmin /></Page></RouteFrame>;
}
