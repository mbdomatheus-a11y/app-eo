// Metro do EO. No site (web) troca módulos que só existem no aparelho por versões de navegador.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const substitutosWeb = {
  "expo-secure-store": path.resolve(__dirname, "src/web/secure-store.web.ts"),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && substitutosWeb[moduleName]) {
    return { type: "sourceFile", filePath: substitutosWeb[moduleName] };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
