import { OfflineScreen } from "../features/OfflineStatus";
import { RouteFrame } from "../navigation/route-screens";
export default function SyncRoute() {
  return (
    <RouteFrame>
      <OfflineScreen />
    </RouteFrame>
  );
}
