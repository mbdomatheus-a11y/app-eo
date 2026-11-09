import { useEO } from "../providers/eo-provider";
import { Button } from "../ui";
import { ModulesScreen } from "../../App";
import { RouteFrame } from "../navigation/route-screens";
import { router, useLocalSearchParams } from "expo-router";
export default function Screen() {
  const app = useEO();
  const { run } = useLocalSearchParams<{ run?: string }>();
  return (
    <RouteFrame>
      {app.workspace?.person.role === "admin" && (
        <Button
          title="Criar novo checklist"
          onPress={() => router.push("/checklist-admin" as never)}
        />
      )}
      <ModulesScreen
        mode="checklists"
        initialRun={run}
        openTab={(tab) =>
          router.navigate(
            (tab === "notices" ? "/notices" : "/modules") as never,
          )
        }
      />
    </RouteFrame>
  );
}
