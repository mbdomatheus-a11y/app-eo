import { Redirect } from "expo-router";
import { useEO } from "../providers/eo-provider";
import { RouteFrame } from "../navigation/route-screens";
import { ChecklistReport } from "../features/ChecklistReport";
export default function ChecklistReports() {
  const app = useEO();
  if (!["admin", "diretor"].includes(app.workspace?.person.role || ""))
    return <Redirect href="/" />;
  return (
    <RouteFrame>
      <ChecklistReport />
    </RouteFrame>
  );
}
