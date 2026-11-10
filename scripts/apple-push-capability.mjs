const origin = "https://api.appstoreconnect.apple.com";
export function appleApiUrl(path) {
  const url = new URL(path, `${origin}/v1/`);
  if (url.origin !== origin || !url.pathname.startsWith("/v1/"))
    throw new Error("URL Apple fora do escopo permitido.");
  return url;
}
export function appleApiError(status, path, result) {
  const errors = (result.errors ?? []).map((error) => ({
    code: error.code,
    detail: error.detail,
    source: error.source,
  }));
  return new Error(
    `Apple API ${status} em ${appleApiUrl(path).pathname}: ${JSON.stringify(errors)}`,
  );
}
export async function ensureEoPush(api) {
  const identifier = "com.appeo.mobile";
  const bundles = await api(
    `bundleIds?filter[identifier]=${encodeURIComponent(identifier)}`,
  );
  const bundle = bundles.data?.find(
    (item) => item.attributes?.identifier === identifier,
  );
  if (!bundle)
    throw new Error(
      "App ID do EO não encontrado. Nenhum outro aplicativo foi alterado.",
    );
  // Não impor limit: a Apple pode rejeitar a consulta antes de retornar capabilities.
  // Seguir a paginação retornada, validando o domínio antes de enviar o token.
  let path = `bundleIds/${encodeURIComponent(bundle.id)}/bundleIdCapabilities`;
  const seen = new Set();
  while (path) {
    const url = appleApiUrl(path).href;
    if (seen.has(url) || seen.size >= 20)
      throw new Error("Paginação Apple inválida.");
    seen.add(url);
    const page = await api(path);
    if (
      page.data?.some(
        (item) => item.attributes?.capabilityType === "PUSH_NOTIFICATIONS",
      )
    )
      return;
    path = page.links?.next ?? null;
  }
  await api("bundleIdCapabilities", {
    data: {
      type: "bundleIdCapabilities",
      attributes: { capabilityType: "PUSH_NOTIFICATIONS" },
      relationships: {
        bundleId: { data: { type: "bundleIds", id: bundle.id } },
      },
    },
  });
}
