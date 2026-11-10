import os
import plistlib
import sys


def validate(export_path, entitlements_path, team):
    if not team:
        raise ValueError("APPLE_TEAM_ID não configurado.")
    with open(export_path, "rb") as source:
        options = plistlib.load(source)
    with open(entitlements_path, "rb") as source:
        entitlements = plistlib.load(source)
    if options.get("method") != "app-store-connect" or options.get("signingStyle") != "automatic":
        raise ValueError("A exportação EO precisa usar App Store Connect e assinatura automática.")
    if options.get("teamID") != team:
        raise ValueError("Equipe da exportação difere da equipe configurada.")
    if options.get("provisioningProfiles"):
        raise ValueError("Não misturar perfis manuais com a exportação automática do EO.")
    if entitlements.get("aps-environment") != "production":
        raise ValueError("O target EO precisa declarar aps-environment production.")
    identifier = entitlements.get("application-identifier")
    if identifier and identifier != team + ".com.appeo.mobile":
        raise ValueError("Entitlements de outro aplicativo, operação cancelada.")
    if entitlements.get("get-task-allow") is True:
        raise ValueError("Entitlements de depuração não podem ser exportados para TestFlight.")


if __name__ == "__main__":
    validate(sys.argv[1], sys.argv[2], os.environ.get("APPLE_TEAM_ID"))
    print("Entradas de assinatura EO coerentes. Assinatura e APNs serão verificados no IPA real antes do upload.")
