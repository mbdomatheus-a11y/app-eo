import { ModulesScreen } from "../../App";
import { RouteFrame } from "../navigation/route-screens";
import { router } from "expo-router";
export default function Screen() {
  return (
    <RouteFrame>
      <ModulesScreen
        mode="alerts"
        openTab={(tab) =>
          router.navigate(
            (tab === "notices" ? "/notices" : "/modules") as never,
          )
        }
      />
    </RouteFrame>
  );
}
