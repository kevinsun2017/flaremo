import { applyFlaremoMigrations, createDb } from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deletePushSubscription,
  encryptPushPayloadForTest,
  listPushSubscriptions,
  savePushSubscription,
} from "./push";

async function hkdfForTest(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    ikm as unknown as BufferSource,
    "HKDF",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: salt as unknown as BufferSource,
        info: info as unknown as BufferSource,
      },
      key,
      length * 8,
    ),
  );
}

import { ensureSingleUser } from "./users";

let mf: Miniflare;
let db: ReturnType<typeof createDb>;
let user: Awaited<ReturnType<typeof ensureSingleUser>>;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function generateKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const clientPrivateKey = pair.privateKey;
  // Export as PKCS#8 for the "client" side of the decrypt test, and the raw
  // public key in base64url like a browser PushSubscription provides.
  const publicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );
  const privateKeyPkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", clientPrivateKey),
  );
  return {
    publicKey: base64Url(publicKeyRaw),
    privateKeyPkcs8,
    publicKeyRaw,
    clientPrivateKey,
  };
}

describe("web push", () => {
  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-push-test" },
    });
    const database = await mf.getD1Database("DB");
    db = createDb(database);
    await applyFlaremoMigrations(database);
    user = await ensureSingleUser(db, {
      email: "owner@example.com",
      name: "Owner",
    });
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("stores and removes subscriptions idempotently per endpoint", async () => {
    const endpoint = "https://push.example/endpoint-1";
    await savePushSubscription(db, user, {
      endpoint,
      p256dh: "k1",
      auth: "a1",
    });
    await savePushSubscription(db, user, {
      endpoint,
      p256dh: "k2",
      auth: "a2",
    });
    const rows = await listPushSubscriptions(db, user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.p256dh).toBe("k2");

    await deletePushSubscription(db, user, endpoint);
    expect(await listPushSubscriptions(db, user.id)).toHaveLength(0);
  });

  it("encrypts an aes128gcm payload that the subscription key can decrypt", async () => {
    const keys = await generateKeys();
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const { body, serverPublicKey } = await encryptPushPayloadForTest(
      keys.publicKey,
      base64Url(authSecret),
      { title: "FlareMo", body: "daily review", url: "/review/daily" },
    );

    // RFC 8291 envelope: salt(16) + rs(4) + idlen(1) + ciphertext.
    const salt = body.slice(0, 16);
    const ciphertext = body.slice(21);

    // Derive the same keys from the client side and decrypt.
    const clientPrivateKey = keys.clientPrivateKey;
    const serverKey = await crypto.subtle.importKey(
      "raw",
      serverPublicKey as unknown as BufferSource,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const ecdhSecret = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "ECDH", public: serverKey },
        clientPrivateKey,
        256,
      ),
    );
    const encoder = new TextEncoder();
    const info = new Uint8Array([
      ...encoder.encode("WebPush: info\x00"),
      2,
      ...keys.publicKeyRaw,
      ...serverPublicKey,
    ]);
    const ikm = await hkdfForTest(ecdhSecret, authSecret, info, 32);
    const cek = await hkdfForTest(
      ikm,
      salt,
      encoder.encode("Content-Encoding: aes128gcm\x00"),
      16,
    );
    const nonce = await hkdfForTest(
      ikm,
      salt,
      encoder.encode("Content-Encoding: nonce\x00"),
      12,
    );
    const aesKey = await crypto.subtle.importKey(
      "raw",
      cek as unknown as BufferSource,
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce as unknown as BufferSource },
        aesKey,
        ciphertext as unknown as BufferSource,
      ),
    );
    // RFC 8291 padding: 0x02 delimiter then the JSON payload.
    expect(plaintext[0]).toBe(2);
    const decoded = new TextDecoder().decode(plaintext.slice(1));
    expect(JSON.parse(decoded)).toMatchObject({
      title: "FlareMo",
      body: "daily review",
      url: "/review/daily",
    });
  });
});
