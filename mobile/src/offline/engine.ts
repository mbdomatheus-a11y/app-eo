/** Motor sem dependências nativas. A identidade deve vir exclusivamente do Auth. */
export type RpcArgs = Record<string, unknown>;
export type RemoteRpc = <T>(
  name: string,
  args?: RpcArgs,
  signal?: AbortSignal,
) => Promise<T>;

export interface CachedRead {
  key: string;
  name: string;
  args: RpcArgs;
  data: unknown;
  savedAt: number;
  scope: string;
}
export interface PendingMutation {
  id: string;
  name: string;
  args: RpcArgs;
  createdAt: number;
  attempts: number;
  state: "pending" | "failed";
  error?: string;
}
export interface OfflineState {
  version: 1;
  userId: string;
  scope: string;
  cache: CachedRead[];
  queue: PendingMutation[];
}
export interface OfflineStorage {
  load(userId: string): Promise<OfflineState | null>;
  save(userId: string, state: OfflineState): Promise<void>;
  remove(userId: string): Promise<void>;
}
export interface OfflineStatus {
  userId: string | null;
  revalidated: boolean;
  online: boolean;
  syncing: boolean;
  pending: number;
  items: PendingMutation[];
  failed: PendingMutation[];
  staleReads: number;
  lastQueuedAt: number | null;
  lastError: string | null;
}
export interface OfflineOptions {
  storage: OfflineStorage;
  remote: RemoteRpc;
  requestId: () => string;
  now?: () => number;
  cacheTtlMs?: number;
  queueTtlMs?: number;
  maxCacheEntries?: number;
  maxQueueEntries?: number;
  maxBytes?: number;
}

// Somente leituras inspecionadas. Métodos administrativos, URLs assinadas e credenciais
// não são persistidos. eo_notification_preferences também escreve: fica fora da lista.
export const OFFLINE_READ_METHODS = new Set([
  "eo_app_inicio",
  "eo_context",
  "eo_visible_modules",
  "eo_my_modules",
  "eo_module_icons",
  "eo_feed",
  "eo_notice_get",
  "eo_alert_feed",
  "eo_checklist_feed",
  "eo_checklist_detail",
  "eo_inbox",
  "eo_day_entries_page",
  "eo_mood_entries_page",
  "eo_operational_overview",
  "eo_mood_settings",
  "eo_diary_configuration",
  "eo_mood_prompt_state",
  "eo_commercial_page",
  "eo_assortment_sessions",
  "eo_assortment_session",
  "eo_assortment_timing",
  "eo_action_agenda",
  "eo_sales_reports",
  "eo_sales_dataset_page_v2",
  "eo_profile_preferences",
  "eo_my_contact_request",
  "eo_notification_sound",
]);

// Contratos reais, ver migrations 202611090006, 202611090003, 202611090002 e 202610290001.
// O wrapper eo_apply_offline garante idempotência inclusive do histórico do checklist.
// Fotos, uploads, gestão e mutações sem idempotência exigem conexão.
const mutationRequestField: Record<string, string | null> = {
  eo_save_day_entry: "p_request_id",
  eo_save_mood: "p_request_id",
  eo_save_product_request: "p_request",
  eo_notice_open: null,
  eo_acknowledge: null,
  eo_checklist_save: null,
};
export const OFFLINE_MUTATION_METHODS = new Set(
  Object.keys(mutationRequestField),
);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : String((cause as { message?: unknown })?.message ?? cause);

/** Só falhas de transporte/tempo habilitam fallback; HTTP e SQL negados nunca o fazem. */
export function isTransportError(cause: unknown): boolean {
  const error = cause as {
    status?: number;
    statusCode?: number;
    code?: string;
    name?: string;
    message?: string;
  };
  const status = error?.status ?? error?.statusCode;
  if (typeof status === "number" && status !== 0) return status === 408;
  if (
    error?.code &&
    ![
      "NETWORK_ERROR",
      "ETIMEDOUT",
      "ECONNRESET",
      "ENETUNREACH",
      "ECONNREFUSED",
    ].includes(error.code)
  )
    return false;
  if (error?.name === "TimeoutError") return true;
  return /^(?:TypeError: )?(?:Network request failed|Failed to fetch|fetch failed|Load failed)(?:\b|$)|network (?:error|unavailable)|sem conex[aã]o|tempo limite|timed? ?out|timeout/i.test(
    error?.message ?? "",
  );
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as RpcArgs)[key])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export class OfflineEngine {
  private readonly now: () => number;
  private readonly options: Required<
    Pick<
      OfflineOptions,
      | "cacheTtlMs"
      | "queueTtlMs"
      | "maxCacheEntries"
      | "maxQueueEntries"
      | "maxBytes"
    >
  >;
  private serial: Promise<unknown> = Promise.resolve();
  private owner: string | null = null;
  private generation = 0;
  private state: OfflineState | null = null;
  private listeners = new Set<() => void>();
  private value: OfflineStatus = {
    userId: null,
    revalidated: false,
    online: true,
    syncing: false,
    pending: 0,
    items: [],
    failed: [],
    staleReads: 0,
    lastQueuedAt: null,
    lastError: null,
  };

  constructor(private readonly deps: OfflineOptions) {
    this.now = deps.now ?? Date.now;
    this.options = {
      cacheTtlMs: deps.cacheTtlMs ?? 24 * 60 * 60 * 1000,
      queueTtlMs: deps.queueTtlMs ?? 7 * 24 * 60 * 60 * 1000,
      maxCacheEntries: deps.maxCacheEntries ?? 64,
      maxQueueEntries: deps.maxQueueEntries ?? 100,
      maxBytes: deps.maxBytes ?? 2 * 1024 * 1024,
    };
  }

  get status(): OfflineStatus {
    return clone(this.value);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(change: Partial<OfflineStatus> = {}) {
    this.value = {
      ...this.value,
      ...change,
      pending:
        this.state?.queue.filter((item) => item.state === "pending").length ??
        0,
      items: clone(this.state?.queue ?? []),
      failed: clone(
        this.state?.queue.filter((item) => item.state === "failed") ?? [],
      ),
    };
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* Um observador não pode interromper persistência. */
      }
    }
  }
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.serial.then(task);
    this.serial = result.catch(() => undefined);
    return result;
  }
  private assertOwner(userId: string, generation: number) {
    if (
      this.owner !== userId ||
      this.generation !== generation ||
      this.state?.userId !== userId
    )
      throw new Error("A sessão mudou. Abra seu espaço novamente.");
  }
  private snapshot() {
    const userId = this.owner;
    if (!userId) throw new Error("Entre na sua conta para continuar.");
    return { userId, generation: this.generation };
  }

  /** Mudar usuário trava replay imediatamente, mesmo com uma requisição em andamento. */
  setIdentity(userId: string | null): Promise<void> {
    if (this.owner === userId) return this.exclusive(async () => undefined);
    this.owner = userId;
    const generation = ++this.generation;
    this.state = null;
    this.emit({
      userId,
      revalidated: false,
      online: true,
      syncing: false,
      staleReads: 0,
      lastQueuedAt: null,
      lastError: null,
    });
    return this.exclusive(async () => {
      if (this.generation !== generation || !userId) return;
      const loaded = await this.deps.storage.load(userId);
      if (this.generation !== generation) return;
      this.state = this.restore(loaded, userId);
      this.emit();
    });
  }

  /** Chamar somente depois de eo_app_inicio AO VIVO e validação de acesso bem-sucedidos. */
  revalidate(userId: string): Promise<void> {
    const generation = this.generation;
    return this.exclusive(async () => {
      this.assertOwner(userId, generation);
      this.emit({ revalidated: true, online: true });
    });
  }

  /** Abrangência vem do contexto do servidor; preserva fila, invalida leituras antigas. */
  setScope(scope: string): Promise<void> {
    const owner = this.snapshot();
    return this.exclusive(async () => {
      this.assertOwner(owner.userId, owner.generation);
      if (this.state!.scope === scope) return;
      const next = clone(this.state!);
      next.scope = scope;
      next.cache = [];
      await this.persist(next, owner);
    });
  }

  cached<T>(name: string, args: RpcArgs = {}): T | null {
    if (!this.state || !this.owner) return null;
    const entry = this.state.cache.find(
      (item) =>
        item.key === stable([name, args]) &&
        item.scope === this.state!.scope &&
        this.now() - item.savedAt <= this.options.cacheTtlMs,
    );
    return entry ? (clone(entry.data) as T) : null;
  }
  remember(name: string, args: RpcArgs, data: unknown): Promise<void> {
    const owner = this.snapshot();
    return this.exclusive(async () => {
      this.assertOwner(owner.userId, owner.generation);
      if (!OFFLINE_READ_METHODS.has(name)) return;
      const next = clone(this.state!);
      const key = stable([name, args]);
      next.cache = next.cache.filter((item) => item.key !== key);
      next.cache.push({
        key,
        name,
        args: clone(args),
        data: clone(data),
        savedAt: this.now(),
        scope: next.scope,
      });
      await this.persist(next, owner);
    });
  }
  markOffline(error?: string) {
    this.emit({ online: false, revalidated: false, lastError: error ?? null });
  }
  invalidateAccess(): Promise<void> {
    const owner = this.snapshot();
    return this.exclusive(async () => {
      this.assertOwner(owner.userId, owner.generation);
      const next = clone(this.state!);
      next.cache = [];
      await this.persist(next, owner);
      this.emit({ revalidated: false, online: true });
    });
  }

  /** Saída oculta a identidade imediatamente; preserva somente envios pendentes cifrados. */
  logout(): Promise<void> {
    const previous = this.owner;
    const saved = this.state ? clone(this.state) : null;
    if (saved) saved.cache = [];
    this.owner = null;
    ++this.generation;
    this.state = null;
    this.emit({
      userId: null,
      revalidated: false,
      syncing: false,
      staleReads: 0,
      lastQueuedAt: null,
    });
    return this.exclusive(async () => {
      if (previous) {
        if (saved?.queue.length) await this.deps.storage.save(previous, saved);
        else await this.deps.storage.remove(previous);
      }
    });
  }

  async rpc<T>(
    name: string,
    args: RpcArgs = {},
    signal?: AbortSignal,
  ): Promise<T> {
    // Captura antes da espera: uma ação da conta A nunca pode migrar para a conta B.
    const owner = this.snapshot();
    const immutableArgs = clone(args);
    const readOnly =
      OFFLINE_READ_METHODS.has(name) &&
      (!["eo_profile_preferences", "eo_notification_sound"].includes(name) ||
        Object.keys(args).length === 0);
    if (readOnly && (!this.value.online || !this.value.revalidated)) {
      const cached = this.cached<T>(name, immutableArgs);
      if (cached !== null) {
        this.emit({ staleReads: this.value.staleReads + 1 });
        return cached;
      }
      if (!this.value.online)
        throw new Error(
          "Esta informação ainda não foi carregada neste aparelho. Conecte-se para baixar.",
        );
    }
    return this.exclusive(async () => {
      this.assertOwner(owner.userId, owner.generation);
      if (signal?.aborted) {
        const aborted = new Error("Operação cancelada");
        aborted.name = "AbortError";
        throw aborted;
      }
      if (
        OFFLINE_MUTATION_METHODS.has(name) &&
        this.canQueue(name, immutableArgs)
      )
        return this.mutate<T>(name, immutableArgs, owner, signal);
      try {
        const data = await this.deps.remote<T>(name, immutableArgs, signal);
        this.assertOwner(owner.userId, owner.generation);
        this.emit({ online: true, lastError: null });
        if (readOnly) {
          const next = clone(this.state!);
          const key = stable([name, immutableArgs]);
          next.cache = next.cache.filter((item) => item.key !== key);
          next.cache.push({
            key,
            name,
            args: immutableArgs,
            data: clone(data),
            savedAt: this.now(),
            scope: next.scope,
          });
          try {
            await this.persist(next, owner);
          } catch (cause) {
            this.assertOwner(owner.userId, owner.generation);
            this.emit({
              lastError: `Não foi possível guardar a leitura: ${message(cause)}`,
            });
          }
        }
        return data;
      } catch (cause) {
        this.assertOwner(owner.userId, owner.generation);
        if (!isTransportError(cause) || signal?.aborted) {
          await this.permissionFailure(cause, owner);
          throw cause;
        }
        this.emit({ online: false, lastError: message(cause) });
        const cached = this.state!.cache.find(
          (item) =>
            item.key === stable([name, immutableArgs]) &&
            item.scope === this.state!.scope &&
            this.now() - item.savedAt <= this.options.cacheTtlMs,
        );
        if (readOnly && cached) {
          this.emit({ staleReads: this.value.staleReads + 1 });
          return clone(cached.data) as T;
        }
        throw new Error(
          readOnly
            ? "Sem conexão e sem uma cópia recente desta informação neste aparelho."
            : "Esta operação precisa de conexão. Tente novamente quando a rede voltar.",
        );
      }
    });
  }

  sync(): Promise<void> {
    const owner = this.snapshot();
    return this.exclusive(async () => {
      this.assertOwner(owner.userId, owner.generation);
      if (!this.value.revalidated) return;
      this.emit({ syncing: true });
      try {
        // Falha permanente bloqueia os itens seguintes para preservar FIFO e intenção.
        while (this.state!.queue.length) {
          this.assertOwner(owner.userId, owner.generation);
          const item = this.state!.queue[0];
          if (item.state === "failed") break;
          if (this.now() - item.createdAt > this.options.queueTtlMs) {
            await this.fail(
              item.id,
              "Pendência antiga. Revise os dados e tente novamente explicitamente.",
              owner,
            );
            break;
          }
          const sent = await this.send(item, owner);
          if (!sent.ok) break;
        }
      } finally {
        if (this.owner === owner.userId && this.generation === owner.generation)
          this.emit({ syncing: false });
      }
    });
  }

  /** Não altera data, conteúdo ou UUID da pendência. Novo conteúdo exige nova ação. */
  retry(id: string): Promise<void> {
    const owner = this.snapshot();
    return this.exclusive(async () => {
      this.assertOwner(owner.userId, owner.generation);
      const next = clone(this.state!);
      const item = next.queue.find((entry) => entry.id === id);
      if (!item) throw new Error("Pendência não encontrada.");
      item.state = "pending";
      delete item.error;
      // Uma tentativa explícita autoriza nova janela de envio, sem mudar os argumentos.
      // Preservar a data original do registro, inclusive após uma correção de acesso.
      await this.persist(next, owner);
    }).then(() => this.sync());
  }
  discard(id: string): Promise<void> {
    const owner = this.snapshot();
    return this.exclusive(async () => {
      this.assertOwner(owner.userId, owner.generation);
      const next = clone(this.state!);
      next.queue = next.queue.filter((item) => item.id !== id);
      await this.persist(next, owner);
    });
  }

  private canQueue(name: string, args: RpcArgs) {
    if (name === "eo_save_day_entry")
      return args.p_audio_path == null && args.p_audio_seconds == null;
    if (name === "eo_save_product_request")
      return args.p_audio == null && args.p_seconds == null;
    if (name === "eo_checklist_save") {
      const answer = args.p_answer;
      return (
        !!answer &&
        typeof answer === "object" &&
        !Array.isArray(answer) &&
        Object.keys(answer).length > 0 &&
        Object.entries(answer).every(
          ([key, value]) =>
            (key === "text" && typeof value === "string") ||
            ((key === "value" || key === "accepted") &&
              typeof value === "boolean"),
        )
      );
    }
    return true;
  }
  private async mutate<T>(
    name: string,
    args: RpcArgs,
    owner: { userId: string; generation: number },
    signal?: AbortSignal,
  ): Promise<T> {
    const field = mutationRequestField[name];
    const request = field
      ? (args[field] ?? this.deps.requestId())
      : this.deps.requestId();
    if (typeof request !== "string" || !UUID.test(request))
      throw new Error("Identificador de solicitação inválido.");
    if (field) args[field] = request;
    // Escrita antecipada: se o servidor confirmar e a resposta se perder, reenvio usa UUID igual.
    const existing = this.state!.queue.find(
      (item) =>
        item.name === name &&
        (field
          ? item.args[field] === request
          : stable(item.args) === stable(args)),
    );
    if (existing && stable(existing.args) !== stable(args))
      throw new Error("Esta solicitação já foi usada com outro conteúdo.");
    if (existing?.state === "failed")
      throw new Error(
        existing.error ?? "Revise a pendência antes de tentar novamente.",
      );
    const id = existing?.id ?? request;
    if (!existing) {
      if (this.state!.queue.length >= this.options.maxQueueEntries)
        throw new Error(
          "Fila local cheia. Sincronize ou descarte uma pendência antes de continuar.",
        );
      const next = clone(this.state!);
      next.queue.push({
        id,
        name,
        args,
        createdAt: this.now(),
        attempts: 0,
        state: "pending",
      });
      await this.persist(next, owner);
    }
    this.emit({ lastQueuedAt: this.now() });
    // Somente o primeiro item pode ser enviado. As outras ações ficam na mesma ordem.
    if (
      this.value.revalidated &&
      this.value.online &&
      this.state!.queue[0].id === id
    ) {
      const sent = await this.send(this.state!.queue[0], owner, signal);
      if (sent.ok) return sent.data as T;
      if (sent.cause && !isTransportError(sent.cause)) throw sent.cause;
    }
    // APIs de cadastro retornam UUID. Na fila ele identifica a intenção, não uma linha remota.
    return (
      field
        ? request
        : name === "eo_acknowledge"
          ? new Date(this.now()).toISOString()
          : undefined
    ) as T;
  }
  private async send(
    item: PendingMutation,
    owner: { userId: string; generation: number },
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; data?: unknown; cause?: unknown }> {
    this.assertOwner(owner.userId, owner.generation);
    try {
      const data = await this.deps.remote(
        "eo_apply_offline",
        {
          p_id: item.id,
          p_method: item.name,
          p_args: clone(item.args),
          p_recorded_at: new Date(item.createdAt).toISOString(),
        },
        signal,
      );
      this.assertOwner(owner.userId, owner.generation);
      const next = clone(this.state!);
      next.queue = next.queue.filter((entry) => entry.id !== item.id);
      // Leituras anteriores à escrita não representam mais o estado confirmado.
      // Manter a última cópia para nova abertura offline; leituras online a renovam.
      await this.persist(next, owner);
      this.emit({ online: true, lastError: null });
      return { ok: true, data };
    } catch (cause) {
      this.assertOwner(owner.userId, owner.generation);
      if (isTransportError(cause) || signal?.aborted) {
        const next = clone(this.state!);
        const pending = next.queue.find((entry) => entry.id === item.id)!;
        pending.attempts++;
        pending.error = message(cause);
        await this.persist(next, owner);
        this.emit({ online: false, lastError: message(cause) });
      } else {
        await this.fail(item.id, message(cause), owner);
        await this.permissionFailure(cause, owner);
      }
      return { ok: false, cause };
    }
  }
  private async fail(
    id: string,
    error: string,
    owner: { userId: string; generation: number },
  ) {
    const next = clone(this.state!);
    const item = next.queue.find((entry) => entry.id === id)!;
    item.state = "failed";
    item.error = error;
    item.attempts++;
    await this.persist(next, owner);
    this.emit({ lastError: error });
  }
  private async permissionFailure(
    cause: unknown,
    owner: { userId: string; generation: number },
  ) {
    const error = cause as { status?: number; code?: string };
    if (
      error?.status === 401 ||
      error?.status === 403 ||
      ["42501", "PGRST301", "PGRST302", "PGRST303"].includes(error?.code ?? "")
    ) {
      const next = clone(this.state!);
      next.cache = [];
      await this.persist(next, owner);
      this.emit({ revalidated: false, lastError: message(cause) });
    }
  }
  private restore(loaded: OfflineState | null, userId: string): OfflineState {
    if (
      !loaded ||
      loaded.version !== 1 ||
      loaded.userId !== userId ||
      !Array.isArray(loaded.cache) ||
      !Array.isArray(loaded.queue)
    )
      return { version: 1, userId, scope: "", cache: [], queue: [] };
    const restored = clone(loaded);
    restored.scope = typeof loaded.scope === "string" ? loaded.scope : "";
    restored.cache = restored.cache.filter(
      (item) =>
        OFFLINE_READ_METHODS.has(item.name) &&
        typeof item.key === "string" &&
        Number.isFinite(item.savedAt) &&
        item.savedAt <= this.now() &&
        this.now() - item.savedAt <= this.options.cacheTtlMs &&
        item.scope === restored.scope,
    );
    restored.queue = restored.queue.filter((item) => {
      if (
        !OFFLINE_MUTATION_METHODS.has(item.name) ||
        !item.args ||
        !this.canQueue(item.name, item.args) ||
        typeof item.id !== "string" ||
        !UUID.test(item.id) ||
        !Number.isFinite(item.createdAt)
      )
        return false;
      const field = mutationRequestField[item.name];
      return (
        (!field ||
          (typeof item.args[field] === "string" &&
            UUID.test(item.args[field] as string))) &&
        ["pending", "failed"].includes(item.state)
      );
    });
    this.prune(restored);
    return restored;
  }
  private prune(next: OfflineState) {
    next.cache = next.cache
      .filter((item) => this.now() - item.savedAt <= this.options.cacheTtlMs)
      .slice(-this.options.maxCacheEntries);
    // Conservador para UTF-16: limita também textos multibyte sem precisar de TextEncoder nativo.
    while (
      next.cache.length &&
      JSON.stringify(next).length * 3 > this.options.maxBytes
    )
      next.cache.shift();
  }
  private async persist(
    next: OfflineState,
    owner: { userId: string; generation: number },
  ) {
    this.assertOwner(owner.userId, owner.generation);
    this.prune(next);
    if (JSON.stringify(next).length * 3 > this.options.maxBytes)
      throw new Error(
        "Armazenamento local cheio. Sincronize ou descarte pendências antes de continuar.",
      );
    await this.deps.storage.save(owner.userId, clone(next));
    this.assertOwner(owner.userId, owner.generation);
    this.state = next;
    this.emit();
  }
}
