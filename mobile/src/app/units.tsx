import { Redirect } from "expo-router";
import { useEO } from "../providers/eo-provider";
import { RouteFrame } from "../navigation/route-screens";
import { BusinessUnits } from "../features/BusinessUnits";
export default function Units() {
  const app = useEO();
  if (app.workspace?.person.role !== "admin") return <Redirect href="/" />;
  return (
    <RouteFrame>
      <BusinessUnits />
    </RouteFrame>
  );
}
