import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  CryptoDigestAlgorithm,
  aesDecryptAsync,
  aesEncryptAsync,
  digestStringAsync,
  randomUUID,
} from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";

const MAX_PLAINTEXT_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = Math.ceil((MAX_PLAINTEXT_BYTES + 28) / 3) * 4 + 128;
const FILE_NAME = /^snapshot-[a-f0-9-]{36}\.json$/;
const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: "app-eo.offline.v1",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  // O bloqueio biométrico pertence à sessão e não deve abrir outro prompt aqui.
  requireAuthentication: false,
};

type KeyRecord = { version: 1; key: string; file: string };
type Lane = { tail: Promise<void>; generation: number; revoked: boolean };
const lanes = new Map<string, Lane>();

function laneFor(userId: string): Lane {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,255}$/.test(userId)) {
    throw new Error("Identidade inválida para o armazenamento offline.");
  }
  let lane = lanes.get(userId);
  if (!lane) {
    lane = { tail: Promise.resolve(), generation: 0, revoked: false };
    lanes.set(userId, lane);
  }
  return lane;
}

function enqueue<T>(lane: Lane, work: () => Promise<T>): Promise<T> {
  const pending = lane.tail.then(work);
  lane.tail = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}

async function location(userId: string) {
  if (!FileSystem.documentDirectory) {
    throw new Error("Armazenamento privado indisponível neste dispositivo.");
  }
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, userId);
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error("Não foi possível proteger a identidade offline.");
  }
  return {
    directory: `${FileSystem.documentDirectory}eo-offline-v1/${digest}/`,
    keyName: `eo-offline-v1.${digest}`,
    aad: new TextEncoder().encode(`app-eo.offline.v1:${digest}`),
  };
}

function parseKeyRecord(raw: string | null): KeyRecord | null {
  if (!raw || raw.length > 512) return null;
  try {
    const value = JSON.parse(raw) as Partial<KeyRecord> | null;
    if (
      value?.version !== 1 ||
      typeof value.key !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.key) ||
      typeof value.file !== "string" ||
      !FILE_NAME.test(value.file)
    )
      return null;
    return value as KeyRecord;
  } catch {
    return null;
  }
}

function forbidCredentials(key: string, value: unknown): unknown {
  const field = key.toLowerCase().replace(/[^a-z]/g, "");
  if (
    /^(password|senha|token|accesstoken|refreshtoken|idtoken|authorization|apikey|clientsecret)$/.test(
      field,
    )
  ) {
    throw new Error("Credenciais não podem ser incluídas no cache offline.");
  }
  return value;
}

async function cleanup(directory: string, keep?: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) return;
  if (!info.isDirectory) throw new Error("Diretório offline inválido.");
  const names = await FileSystem.readDirectoryAsync(directory);
  for (const name of names) {
    // Não seguir nomes retornados pelo sistema sem conferir o escopo.
    if (
      name !== keep &&
      (FILE_NAME.test(name) || /^pending-[a-f0-9-]{36}\.tmp$/.test(name))
    ) {
      await FileSystem.deleteAsync(directory + name, { idempotent: true });
    }
  }
}

/** Cache cifrado por identidade. Chamar load ao iniciar uma nova sessão.
 * remove invalida imediatamente gravações pendentes; somente um novo load
 * reabre a identidade. O consumidor também deve descartar callbacks da sessão anterior.
 * O SDK protege a chave no sistema; nenhum arquivo contém chave ou credencial.
 */
export const encryptedOfflineStorage = {
  async load(userId: string): Promise<unknown | null> {
    const lane = laneFor(userId);
    const generation = lane.generation;
    return enqueue(lane, async () => {
      if (generation !== lane.generation) return null;
      lane.revoked = false;
      const { directory, keyName, aad } = await location(userId);
      const record = parseKeyRecord(
        await SecureStore.getItemAsync(keyName, KEY_OPTIONS),
      );
      if (!record || lane.revoked || generation !== lane.generation)
        return null;
      const info = await FileSystem.getInfoAsync(directory + record.file);
      if (!info.exists || info.isDirectory || info.size > MAX_FILE_BYTES)
        return null;
      const raw = await FileSystem.readAsStringAsync(directory + record.file);
      if (raw.length > MAX_FILE_BYTES) return null;
      let combined: string;
      try {
        const envelope = JSON.parse(raw) as {
          version?: unknown;
          sealed?: unknown;
        } | null;
        if (
          envelope?.version !== 1 ||
          typeof envelope.sealed !== "string" ||
          envelope.sealed.length < 40 ||
          envelope.sealed.length % 4 !== 0 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.sealed)
        )
          return null;
        combined = envelope.sealed;
      } catch {
        return null;
      }
      // Importação e acesso ao sistema ficam fora do tratamento de corrupção.
      const key = await AESEncryptionKey.import(record.key, "hex");
      let plaintext: Uint8Array;
      try {
        const sealed = AESSealedData.fromCombined(combined, {
          ivLength: 12,
          tagLength: 16,
        });
        plaintext = await aesDecryptAsync(sealed, key, { additionalData: aad });
      } catch {
        // Falha de autenticação GCM nunca dá acesso a conteúdo parcial.
        return null;
      }
      try {
        if (
          lane.revoked ||
          generation !== lane.generation ||
          plaintext.byteLength > MAX_PLAINTEXT_BYTES
        )
          return null;
        const payload = JSON.parse(
          new TextDecoder().decode(plaintext),
          forbidCredentials,
        ) as { version?: unknown; state?: unknown } | null;
        return payload?.version === 1 &&
          Object.prototype.hasOwnProperty.call(payload, "state")
          ? payload.state
          : null;
      } catch {
        return null;
      } finally {
        plaintext.fill(0);
      }
    });
  },

  async save(userId: string, state: unknown): Promise<void> {
    const lane = laneFor(userId);
    const generation = lane.generation;
    // Capturar o snapshot na chamada evita que o estado mude enquanto aguarda a fila.
    const json = JSON.stringify({ version: 1, state }, forbidCredentials);
    const plaintext = new TextEncoder().encode(json);
    if (state === undefined || plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
      plaintext.fill(0);
      return Promise.reject(
        new Error("Cache offline inválido ou acima do limite de 8 MB."),
      );
    }
    return enqueue(lane, async () => {
      let temporary: string | undefined;
      try {
        if (lane.revoked || generation !== lane.generation) return;
        const { directory, keyName, aad } = await location(userId);
        const old = parseKeyRecord(
          await SecureStore.getItemAsync(keyName, KEY_OPTIONS),
        );
        const key = old
          ? await AESEncryptionKey.import(old.key, "hex")
          : await AESEncryptionKey.generate(AESKeySize.AES256);
        const sealed = await aesEncryptAsync(plaintext, key, {
          nonce: { length: 12 },
          tagLength: 16,
          additionalData: aad,
        });
        const encrypted = JSON.stringify({
          version: 1,
          sealed: await sealed.combined("base64"),
        });
        if (encrypted.length > MAX_FILE_BYTES)
          throw new Error("Cache cifrado acima do limite permitido.");
        if (lane.revoked || generation !== lane.generation) return;
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        const id = randomUUID().toLowerCase();
        if (!/^[a-f0-9-]{36}$/.test(id))
          throw new Error("Identificador de escrita inválido.");
        const file = `snapshot-${id}.json`;
        temporary = `${directory}pending-${id}.tmp`;
        await FileSystem.writeAsStringAsync(temporary, encrypted);
        if (lane.revoked || generation !== lane.generation) return;
        // Destino único: o move nunca apaga o snapshot anterior antes do commit.
        await FileSystem.moveAsync({ from: temporary, to: directory + file });
        temporary = undefined;
        if (lane.revoked || generation !== lane.generation) return;
        const record: KeyRecord = {
          version: 1,
          key: await key.encoded("hex"),
          file,
        };
        // O ponteiro protegido é o commit. Uma escrita interrompida mantém a versão anterior.
        await SecureStore.setItemAsync(
          keyName,
          JSON.stringify(record),
          KEY_OPTIONS,
        );
        if (!lane.revoked && generation === lane.generation) {
          // Sobras contêm apenas cifra; uma falha de limpeza não invalida o commit.
          await cleanup(directory, file).catch(() => undefined);
        }
      } finally {
        plaintext.fill(0);
        if (temporary)
          await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(
            () => undefined,
          );
      }
    });
  },

  async remove(userId: string): Promise<void> {
    const lane = laneFor(userId);
    lane.generation += 1;
    lane.revoked = true;
    return enqueue(lane, async () => {
      const { directory, keyName } = await location(userId);
      // Tentar ambos mesmo se o dispositivo impedir uma das remoções.
      const results = await Promise.allSettled([
        SecureStore.deleteItemAsync(keyName, KEY_OPTIONS),
        FileSystem.deleteAsync(directory, { idempotent: true }),
      ]);
      const failed = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failed) throw failed.reason;
    });
  },
};
