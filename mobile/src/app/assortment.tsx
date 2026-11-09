import { useLocalSearchParams } from "expo-router";
import { CommercialScreen } from "../features/CommercialScreen";
import { RouteFrame } from "../navigation/route-screens";
export default function Screen() {
  const { report } = useLocalSearchParams<{ report?: string }>();
  return (
    <RouteFrame>
      <CommercialScreen mode="assortment" reportOnly={report === "1"} />
    </RouteFrame>
  );
}
