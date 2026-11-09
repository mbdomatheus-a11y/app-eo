export function emailSuggestions(
  value: string,
  domains: string[],
  preferred = "",
) {
  const [local, typedDomain = ""] = value.trim().split("@");
  if (!local || value.split("@").length > 2 || /\s/.test(local)) return [];
  return [...new Set([preferred, ...domains].filter(Boolean))]
    .filter((domain) =>
      domain.toLowerCase().startsWith(typedDomain.toLowerCase()),
    )
    .slice(0, 5)
    .map((domain) => `${local}@${domain}`);
}
