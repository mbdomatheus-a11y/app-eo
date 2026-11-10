import importlib.util
import pathlib
import plistlib
import io
from unittest.mock import patch
import unittest

spec = importlib.util.spec_from_file_location("signing_inputs", pathlib.Path(__file__).with_name("ios-validate-signing-inputs.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SigningInputsTest(unittest.TestCase):
    def check_inputs(self, options=None, entitlements=None, team="TESTTEAM"):
        options = options or {"method": "app-store-connect", "signingStyle": "automatic", "teamID": "TESTTEAM"}
        entitlements = entitlements or {"aps-environment": "production"}
        with patch("builtins.open", side_effect=lambda path, mode: io.BytesIO(plistlib.dumps(options if path == "export" else entitlements))):
            module.validate("export", "target", team)

    def test_accepts_production(self):
        self.check_inputs()

    def test_rejects_conflicting_profile(self):
        with self.assertRaisesRegex(ValueError, "perfis manuais"):
            self.check_inputs(options={"method": "app-store-connect", "signingStyle": "automatic", "teamID": "TESTTEAM", "provisioningProfiles": {"com.appeo.mobile": "manual"}})

    def test_rejects_wrong_team(self):
        with self.assertRaisesRegex(ValueError, "Equipe"):
            self.check_inputs(team="OTHERTEAM")

    def test_rejects_missing_push(self):
        with self.assertRaisesRegex(ValueError, "aps-environment"):
            self.check_inputs(entitlements={"get-task-allow": False})

    def test_rejects_other_app(self):
        with self.assertRaisesRegex(ValueError, "outro aplicativo"):
            self.check_inputs(entitlements={"aps-environment": "production", "application-identifier": "TESTTEAM.com.other.app"})

    def test_rejects_debugging(self):
        with self.assertRaisesRegex(ValueError, "depuração"):
            self.check_inputs(entitlements={"aps-environment": "production", "get-task-allow": True})


if __name__ == "__main__":
    unittest.main()
