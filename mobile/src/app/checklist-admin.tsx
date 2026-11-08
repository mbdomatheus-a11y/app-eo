import { Redirect } from "expo-router";
import { ChecklistExcel } from "../features/ChecklistExcel";
import { useEO } from "../providers/eo-provider";
import { RouteFrame } from "../navigation/route-screens";
import { Page } from "../ui";
export default function ChecklistAdmin() {
  const app = useEO();
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return <RouteFrame><Page><ChecklistExcel stores={app.workspace.stores} onPublished={() => { void app.refreshOperational(); }} /></Page></RouteFrame>;
}
