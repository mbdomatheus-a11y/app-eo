import {
  beginNativeInteraction,
  nativeInteractionDeadline,
} from "./native-interactions";

export const AUTH_TIMEOUT_MS = 15_000;
export const SETTINGS_TIMEOUT_MS = 5_000;
export const BACKGROUND_GRACE_MS = 1_500;
type Phase = "loading" | "idle" | "unlocking" | "configuring" | "password";
export type DeviceSecurityState = {
  owner: string | null;
  enabled: boolean;
  locked: boolean;
  phase: Phase;
  message: string;
};
export type SecurityDependencies = {
  readEnabled: (user: string) => Promise<boolean>;
  readSecret: (user: string) => Promise<string | null>;
  writeSecret: (user: string) => Promise<void>;
  writeEnabled: (user: string, enabled: boolean) => Promise<void>;
  canUseBiometry: () => boolean;
  signout: () => Promise<{ ok: boolean; message?: string }>;
  report: (error: unknown) => void;
};
class SecurityTimeout extends Error {}
class StaleOperation extends Error {}

export class DeviceSecurityMachine {
  private state: DeviceSecurityState = {
    owner: null,
    enabled: false,
    locked: true,
    phase: "loading",
    message: "",
  };
  private user = "";
  private generation = 0;
  private mounted = true;
  private appState: string;
  private awaySince: number | null = null;
  private autoAttempted = false;
  private autoTimer: ReturnType<typeof setTimeout> | undefined;
  private backgroundTimer: ReturnType<typeof setTimeout> | undefined;
  private cancelOperation: (() => void) | undefined;
  private listeners = new Set<() => void>();
  private passwordReturn: {
    user: string;
    sawSignedOut: boolean;
    confirmed: boolean;
  } | null = null;

  constructor(
    private dependencies: SecurityDependencies,
    initialAppState = "active",
  ) {
    this.appState = initialAppState;
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<DeviceSecurityState>) {
    if (!this.mounted) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private invalidate() {
    this.generation++;
    this.cancelOperation?.();
    this.cancelOperation = undefined;
  }
  private valid(token: number, user: string) {
    return this.mounted && token === this.generation && user === this.user;
  }
  private assertValid(token: number, user: string) {
    if (!this.valid(token, user)) throw new StaleOperation();
  }
  private async bounded<T>(
    operation: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new SecurityTimeout(
                  "A confirmação do aparelho excedeu o prazo.",
                ),
              ),
            timeoutMs,
          );
          cancel = () => reject(new StaleOperation());
          this.cancelOperation = cancel;
        }),
      ]);
    } finally {
      clearTimeout(timer);
      if (this.cancelOperation === cancel) this.cancelOperation = undefined;
    }
  }
  async setUser(user: string) {
    this.mounted = true;
    this.invalidate();
    clearTimeout(this.autoTimer);
    clearTimeout(this.backgroundTimer);
    this.user = user;
    this.awaySince = null;
    this.autoAttempted = false;
    const token = this.generation;
    if (!user && this.passwordReturn) this.passwordReturn.sawSignedOut = true;
    const fromPassword = Boolean(
      user &&
      this.passwordReturn?.user === user &&
      this.passwordReturn.sawSignedOut &&
      this.passwordReturn.confirmed,
    );
    if (user && this.passwordReturn?.sawSignedOut) this.passwordReturn = null;
    this.update({ owner: null, locked: true, phase: "loading", message: "" });
    try {
      const enabled = user
        ? await this.bounded(
            this.dependencies.readEnabled(user),
            SETTINGS_TIMEOUT_MS,
          )
        : false;
      if (!this.valid(token, user)) return;
      this.update({
        owner: user,
        enabled,
        locked: enabled && !fromPassword,
        phase: "idle",
      });
    } catch (error) {
      if (!this.valid(token, user)) return;
      this.dependencies.report(error);
      this.update({
        owner: user,
        enabled: Boolean(user),
        locked: true,
        phase: "idle",
        message:
          "Não foi possível consultar a proteção. Entre com sua senha ou tente desbloquear.",
      });
    }
    this.scheduleAuto();
  }
  private scheduleAuto() {
    clearTimeout(this.autoTimer);
    if (
      !this.user ||
      !this.state.enabled ||
      !this.state.locked ||
      this.state.owner !== this.user ||
      this.state.phase !== "idle" ||
      this.autoAttempted ||
      this.appState !== "active"
    )
      return;
    this.autoTimer = setTimeout(
      () => {
        if (this.appState !== "active" || this.state.phase !== "idle") return;
        if (nativeInteractionDeadline() > Date.now()) {
          this.scheduleAuto();
          return;
        }
        this.autoAttempted = true;
        void this.unlock();
      },
      Math.max(700, nativeInteractionDeadline() - Date.now()),
    );
  }
  async unlock() {
    if (
      !this.user ||
      this.state.owner !== this.user ||
      this.state.phase !== "idle" ||
      !this.state.locked ||
      this.appState !== "active"
    )
      return;
    clearTimeout(this.autoTimer);
    this.autoAttempted = true;
    this.invalidate();
    const token = this.generation,
      user = this.user;
    const finishPrompt = beginNativeInteraction(
      "biometry",
      AUTH_TIMEOUT_MS + 1_000,
    );
    this.update({ phase: "unlocking", message: "" });
    try {
      const secret = await this.bounded(
        this.dependencies.readSecret(user),
        AUTH_TIMEOUT_MS,
      );
      if (!this.valid(token, user)) return;
      if (secret !== user) throw new Error("A proteção do aparelho mudou.");
      this.update({ locked: false, message: "" });
    } catch (error) {
      if (!this.valid(token, user)) return;
      this.dependencies.report(error);
      this.update({
        locked: true,
        message:
          error instanceof SecurityTimeout
            ? "O aparelho não respondeu à confirmação. Entre com sua senha para continuar."
            : "Não foi possível confirmar sua identidade. Tente desbloquear ou entre com sua senha.",
      });
    } finally {
      finishPrompt();
      if (this.valid(token, user)) {
        this.generation++;
        this.update({ phase: "idle" });
      }
    }
  }
  async configure(enabled: boolean) {
    if (
      !this.user ||
      this.state.owner !== this.user ||
      this.state.phase !== "idle" ||
      this.state.locked
    )
      return;
    this.invalidate();
    const token = this.generation,
      user = this.user;
    const finishPrompt = beginNativeInteraction(
      "biometry-settings",
      AUTH_TIMEOUT_MS + 1_000,
    );
    this.update({ phase: "configuring", message: "" });
    const apply = async () => {
      if (enabled) {
        if (!this.dependencies.canUseBiometry())
          throw new Error(
            "Configure Face ID, Touch ID ou biometria nos ajustes do aparelho primeiro.",
          );
        await this.dependencies.writeSecret(user);
        this.assertValid(token, user);
      }
      // Também confirma a identidade para desativar a proteção cadastrada.
      if ((await this.dependencies.readSecret(user)) !== user)
        throw new Error("Identidade não confirmada.");
      this.assertValid(token, user);
      await this.dependencies.writeEnabled(user, enabled);
      this.assertValid(token, user);
    };
    try {
      await this.bounded(apply(), AUTH_TIMEOUT_MS);
      if (this.valid(token, user))
        this.update({
          enabled,
          locked: false,
          message: enabled
            ? "Proteção biométrica ativada."
            : "Proteção biométrica desativada.",
        });
    } catch (error) {
      if (!this.valid(token, user)) return;
      this.dependencies.report(error);
      this.update({
        message:
          error instanceof SecurityTimeout
            ? "O aparelho não respondeu. A configuração não foi confirmada."
            : error instanceof Error
              ? error.message
              : "Não foi possível configurar a biometria.",
      });
    } finally {
      finishPrompt();
      if (this.valid(token, user)) {
        this.generation++;
        this.update({ phase: "idle" });
      }
    }
  }
  async passwordLogin() {
    if (!this.user || this.state.phase === "password") return;
    // O fallback invalida o resultado nativo imediatamente e nunca apaga o cadastro.
    this.invalidate();
    clearTimeout(this.autoTimer);
    this.autoAttempted = true;
    const token = this.generation,
      user = this.user;
    const handoff = { user, sawSignedOut: false, confirmed: false };
    this.passwordReturn = handoff;
    this.update({
      locked: true,
      phase: "password",
      message: "Abrindo a entrada com senha…",
    });
    try {
      // Provider remove credenciais locais antes de ok, com prazo próprio e sem aguardar rede.
      const result = await this.dependencies.signout();
      handoff.confirmed = result.ok;
      if (!this.valid(token, user)) return;
      if (!result.ok)
        this.update({
          message:
            result.message ||
            "Não foi possível encerrar a sessão local. Tente entrar com sua senha novamente.",
        });
    } catch (error) {
      if (!this.valid(token, user)) return;
      this.dependencies.report(error);
      this.update({
        message: "Não foi possível abrir a entrada com senha. Tente novamente.",
      });
    } finally {
      if (this.valid(token, user)) this.update({ phase: "idle" });
    }
  }
  onAppState(state: string) {
    this.appState = state;
    if (state === "background" && this.awaySince === null)
      this.awaySince = Date.now();
    if (state === "background") this.checkBackground();
    if (state === "active") {
      this.checkBackground();
      this.awaySince = null;
      clearTimeout(this.backgroundTimer);
      this.scheduleAuto();
    } else clearTimeout(this.autoTimer);
  }
  private checkBackground = () => {
    clearTimeout(this.backgroundTimer);
    if (this.awaySince === null || !this.state.enabled) return;
    const deadline = Math.max(
      this.awaySince + BACKGROUND_GRACE_MS,
      nativeInteractionDeadline(),
    );
    if (Date.now() >= deadline) {
      if (!this.state.locked || this.state.phase === "unlocking") {
        this.invalidate();
        this.autoAttempted = false;
        this.update({ locked: true, phase: "idle", message: "" });
      }
    } else if (this.appState !== "active")
      this.backgroundTimer = setTimeout(
        this.checkBackground,
        Math.min(1_000, deadline - Date.now()),
      );
  };
  dispose() {
    this.mounted = false;
    this.invalidate();
    clearTimeout(this.autoTimer);
    clearTimeout(this.backgroundTimer);
  }
}
