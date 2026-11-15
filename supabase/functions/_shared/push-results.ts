const codes = new Set([
  "DeviceNotRegistered",
  "InvalidCredentials",
  "MessageTooBig",
  "MessageRateExceeded",
  "MismatchSenderId",
]);
export function pushResults(value: unknown) {
  const tickets = Array.isArray(value) ? value : [];
  let accepted = 0;
  const failures: Record<string, number> = {};
  for (const ticket of tickets) {
    if (ticket?.status === "ok") {
      accepted++;
      continue;
    }
    const code = codes.has(ticket?.details?.error)
      ? ticket.details.error
      : "Unknown";
    failures[code] = (failures[code] ?? 0) + 1;
  }
  return { accepted, failures };
}
export function pushFailureNote(failures: Record<string, number>) {
  if (failures.InvalidCredentials)
    return "O Expo recusou o envio por credencial de push inválida. A configuração APNs/FCM do projeto precisa ser conferida.";
  if (failures.DeviceNotRegistered)
    return "O provedor informou que o aparelho não está mais registrado. Ative as notificações novamente.";
  if (failures.MismatchSenderId)
    return "A credencial Firebase não corresponde ao aplicativo.";
  return "O serviço não aceitou o teste. Tente novamente mais tarde e consulte o diagnóstico.";
}
