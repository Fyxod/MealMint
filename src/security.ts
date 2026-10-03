import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile, open, rename, rm } from "node:fs/promises";
import path from "node:path";

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function redact(text: string) {
  return text
    .replace(/Bearer\s+[^\s"]+/gi, "Bearer [redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[token]",
    )
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, "[bot-token]")
    .replace(
      /(code|state|access_token|refresh_token|code_verifier|token)=([^&\s]+)/gi,
      "$1=[redacted]",
    );
}
export class SecretStore {
  constructor(private dir: string) {}
  private async key() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const filename = path.join(this.dir, "encryption.key");
    try {
      return await readFile(filename);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    const key = randomBytes(32);
    try {
      await writeFile(filename, key, { flag: "wx", mode: 0o600 });
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      return readFile(filename);
    }
    return key;
  }
  async set(name: string, value: unknown) {
    if (!/^[a-z-]+$/.test(name)) throw new Error("Invalid secret name.");
    const key = await this.key(),
      iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    const filename = path.join(this.dir, name + ".enc");
    const temporary = path.join(
      this.dir,
      `${name}.${randomBytes(8).toString("hex")}.tmp`,
    );
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(
          Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
        );
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, filename);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async get<T>(name: string): Promise<T | null> {
    if (!/^[a-z-]+$/.test(name)) throw new Error("Invalid secret name.");
    let data: Buffer;
    try {
      data = await readFile(path.join(this.dir, name + ".enc"));
    } catch (e: any) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      await this.key(),
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    ) as T;
  }
}
