/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

const memory = vi.hoisted(() => ({
  files: new Map<string, string>(),
  keys: new Map<string, string>(),
  options: [] as unknown[],
  keyReadError: false,
  commitError: false,
  moveError: false,
  encryptionBarrier: undefined as Promise<void> | undefined,
  encrypted: undefined as (() => void) | undefined,
}));

vi.mock("expo-crypto", () => {
  class Key {
    constructor(readonly data: Buffer) {}
    static async generate(size: number) {
      expect(size).toBe(256);
      return new Key(randomBytes(32));
    }
    static async import(key: string) {
      return new Key(Buffer.from(key, "hex"));
    }
    async encoded() {
      return this.data.toString("hex");
    }
  }
  class Sealed {
    constructor(readonly data: Buffer) {}
    static fromCombined(data: string) {
      return new Sealed(Buffer.from(data, "base64"));
    }
    async combined() {
      return this.data.toString("base64");
    }
  }
  return {
    AESEncryptionKey: Key,
    AESKeySize: { AES256: 256 },
    AESSealedData: Sealed,
    CryptoDigestAlgorithm: { SHA256: "sha256" },
    digestStringAsync: async (_: string, value: string) =>
      createHash("sha256").update(value).digest("hex"),
    randomUUID,
    aesEncryptAsync: async (
      plain: Uint8Array,
      key: Key,
      options: { additionalData: Uint8Array; nonce: { length: number } },
    ) => {
      memory.encrypted?.();
      await memory.encryptionBarrier;
      const nonce = randomBytes(options.nonce.length);
      const cipher = createCipheriv("aes-256-gcm", key.data, nonce);
      cipher.setAAD(options.additionalData);
      return new Sealed(
        Buffer.concat([
          nonce,
          cipher.update(plain),
          cipher.final(),
          cipher.getAuthTag(),
        ]),
      );
    },
    aesDecryptAsync: async (
      sealed: Sealed,
      key: Key,
      options: { additionalData: Uint8Array },
    ) => {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key.data,
        sealed.data.subarray(0, 12),
      );
      decipher.setAuthTag(sealed.data.subarray(-16));
      decipher.setAAD(options.additionalData);
      return Buffer.concat([
        decipher.update(sealed.data.subarray(12, -16)),
        decipher.final(),
      ]);
    },
  };
});

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: async (name: string) => {
    if (memory.keyReadError) throw new Error("keychain locked");
    return memory.keys.get(name) ?? null;
  },
  setItemAsync: async (name: string, value: string, options: unknown) => {
    if (memory.commitError) throw new Error("commit failed");
    memory.keys.set(name, value);
    memory.options.push(options);
  },
  deleteItemAsync: async (name: string) => {
    memory.keys.delete(name);
  },
}));

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///private/Documents/",
  makeDirectoryAsync: async () => undefined,
  getInfoAsync: async (path: string) =>
    memory.files.has(path)
      ? {
          exists: true,
          isDirectory: false,
          size: Buffer.byteLength(memory.files.get(path)!),
        }
      : {
          exists: [...memory.files.keys()].some((file) =>
            file.startsWith(path),
          ),
          isDirectory: true,
        },
  readAsStringAsync: async (path: string) => memory.files.get(path),
  writeAsStringAsync: async (path: string, data: string) => {
    memory.files.set(path, data);
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    if (memory.moveError) throw new Error("move failed");
    expect(memory.files.has(to)).toBe(false);
    memory.files.set(to, memory.files.get(from)!);
    memory.files.delete(from);
  },
  readDirectoryAsync: async (path: string) =>
    [...memory.files.keys()]
      .filter((file) => file.startsWith(path))
      .map((file) => file.slice(path.length)),
  deleteAsync: async (path: string) => {
    for (const file of memory.files.keys())
      if (file === path || file.startsWith(path)) memory.files.delete(file);
  },
}));

let storage: typeof import("./encrypted-storage").encryptedOfflineStorage;
beforeEach(async () => {
  vi.resetModules();
  memory.files.clear();
  memory.keys.clear();
  memory.options = [];
  memory.keyReadError = memory.commitError = memory.moveError = false;
  memory.encryptionBarrier = undefined;
  memory.encrypted = undefined;
  storage = (await import("./encrypted-storage")).encryptedOfflineStorage;
});

describe("persistência offline cifrada", () => {
  it("recupera Unicode, usa chave256 protegida e nunca grava texto ou chave no arquivo", async () => {
    await storage.save("user-1", { nota: "ação restrita 🛒" });
    expect(await storage.load("user-1")).toEqual({ nota: "ação restrita 🛒" });
    const file = [...memory.files.values()][0];
    expect(file).not.toContain("ação");
    expect(file).not.toContain("nota");
    const key = JSON.parse([...memory.keys.values()][0]).key;
    expect(key).toHaveLength(64);
    expect(file).not.toContain(key);
    expect(memory.options[0]).toMatchObject({
      keychainAccessible: 6,
      requireAuthentication: false,
    });
  });

  it("usa nonce novo e mantém apenas snapshot comprometido", async () => {
    await storage.save("user-1", { value: 1 });
    const previous = [...memory.files.values()][0];
    await storage.save("user-1", { value: 1 });
    expect([...memory.files.values()][0]).not.toBe(previous);
    expect(memory.files.size).toBe(1);
  });

  it("isola usuários e autentica a identidade também pelo AAD", async () => {
    await storage.save("user-1", { loja: 1 });
    expect(await storage.load("user-2")).toBeNull();
    await storage.save("user-2", { loja: 2 });
    const [record1, record2] = [...memory.keys.entries()];
    const target = JSON.parse(record2[1]);
    const source = JSON.parse(record1[1]);
    const file1 = [...memory.files.keys()].find((file) =>
      file.endsWith(source.file),
    )!;
    const file2 = [...memory.files.keys()].find((file) =>
      file.endsWith(target.file),
    )!;
    memory.files.set(file2, memory.files.get(file1)!);
    memory.keys.set(record2[0], JSON.stringify({ ...target, key: source.key }));
    expect(await storage.load("user-2")).toBeNull();
    expect(await storage.load("user-1")).toEqual({ loja: 1 });
  });

  it("falha fechado para cifra alterada e conteúdo que tenta ser texto puro", async () => {
    await storage.save("user-1", { value: 1 });
    const path = [...memory.files.keys()][0];
    const raw = JSON.parse(memory.files.get(path)!);
    const bytes = Buffer.from(raw.sealed, "base64");
    bytes[15] ^= 1;
    memory.files.set(
      path,
      JSON.stringify({ ...raw, sealed: bytes.toString("base64") }),
    );
    expect(await storage.load("user-1")).toBeNull();
    memory.files.set(path, JSON.stringify({ version: 1, state: { value: 1 } }));
    expect(await storage.load("user-1")).toBeNull();
  });

  it("propaga falhas do SecureStore em vez de tratá-las como cache vazio", async () => {
    memory.keyReadError = true;
    await expect(storage.load("user-1")).rejects.toThrow("keychain locked");
    await expect(storage.save("user-1", {})).rejects.toThrow("keychain locked");
  });

  it("preserva o commit anterior se a nova confirmação ou move falhar", async () => {
    await storage.save("user-1", { value: 1 });
    memory.commitError = true;
    await expect(storage.save("user-1", { value: 2 })).rejects.toThrow(
      "commit failed",
    );
    expect(await storage.load("user-1")).toEqual({ value: 1 });
    memory.commitError = false;
    memory.moveError = true;
    await expect(storage.save("user-1", { value: 3 })).rejects.toThrow(
      "move failed",
    );
    expect(await storage.load("user-1")).toEqual({ value: 1 });
  });

  it("remove chave e arquivo e bloqueia uma gravação atrasada do logout", async () => {
    let finish!: () => void;
    memory.encryptionBarrier = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const started = new Promise<void>((resolve) => {
      memory.encrypted = resolve;
    });
    const saving = storage.save("user-1", { confidential: true });
    await started;
    const removing = storage.remove("user-1");
    const lateSave = storage.save("user-1", { confidential: "late" });
    finish();
    await Promise.all([saving, removing, lateSave]);
    expect(memory.files.size).toBe(0);
    expect(memory.keys.size).toBe(0);
    await storage.load("user-1");
    await storage.save("user-1", { newLogin: true });
    expect(await storage.load("user-1")).toEqual({ newLogin: true });
  });

  it("serializa duas gravações sem perder a última", async () => {
    await Promise.all([
      storage.save("user-1", { value: 1 }),
      storage.save("user-1", { value: 2 }),
    ]);
    expect(await storage.load("user-1")).toEqual({ value: 2 });
    expect(memory.files.size).toBe(1);
  });

  it("rejeita traversal, credenciais e dados acima do limite antes de gravar", async () => {
    await expect(storage.save("../another-user", {})).rejects.toThrow(
      "Identidade inválida",
    );
    await expect(
      storage.save("user-1", { nested: { access_token: "secret" } }),
    ).rejects.toThrow("Credenciais");
    await expect(storage.save("user-1", { senha: "secret" })).rejects.toThrow(
      "Credenciais",
    );
    await expect(
      storage.save("user-1", { text: "x".repeat(8 * 1024 * 1024) }),
    ).rejects.toThrow("limite");
    expect(memory.files.size).toBe(0);
    expect(memory.keys.size).toBe(0);
  });
});
