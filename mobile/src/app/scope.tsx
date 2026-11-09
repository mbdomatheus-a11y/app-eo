import { useState } from "react";
import { Text } from "react-native";
import { RouteFrame } from "../navigation/route-screens";
import { useEO } from "../providers/eo-provider";
import { C, Field, Page } from "../ui";
import { Group, ScreenTitle } from "../design";
import { View } from "react-native";
export default function ScopeScreen() {
  const { workspace } = useEO();
  const [search, setSearch] = useState("");
  const stores = (workspace?.stores ?? []).filter((store) =>
    `${store.code} ${store.name} ${store.region}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  return (
    <RouteFrame>
      <Page>
        <ScreenTitle
          title="Suas lojas"
          subtitle={`${workspace?.stores.length ?? 0} unidades no seu acesso`}
        />
        <Field
          label="Buscar unidade"
          value={search}
          onChangeText={setSearch}
          placeholder="Código, nome ou regional"
        />
        <Group>
          {stores.map((store, index) => (
            <View
              key={store.id}
              style={{
                padding: 18,
                gap: 5,
                borderBottomWidth: index < stores.length - 1 ? 0.5 : 0,
                borderColor: "#E8E9ED",
              }}
            >
              <Text style={{ color: C.ink, fontSize: 16, fontWeight: "600" }}>
                {store.code} · {store.name}
              </Text>
              <Text style={{ color: C.muted, fontSize: 13 }}>
                {store.region || "Regional não informada"}
              </Text>
            </View>
          ))}
        </Group>
        {!stores.length && (
          <Text style={{ color: C.muted }}>
            Nenhuma loja corresponde à busca.
          </Text>
        )}
      </Page>
    </RouteFrame>
  );
}
