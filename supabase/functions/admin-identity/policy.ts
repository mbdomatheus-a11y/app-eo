export const unitTypes = ["loja", "ec", "cda", "administracao"] as const;
export function validateOrganizationEmail(
  email: string,
  domains: readonly string[],
  required: boolean,
): string | null {
  if (!email)
    return required ? "O e-mail é obrigatório para esta organização." : null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return "Confira o e-mail informado.";
  // Domínios são sugestões de preenchimento, não uma lista de bloqueio.
  void domains;
  return null;
}
