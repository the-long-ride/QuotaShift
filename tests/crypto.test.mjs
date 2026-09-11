import test from "node:test";
import assert from "node:assert/strict";
import {
  encrypt,
  decrypt,
  hashPassphrase,
  encryptValue,
  decryptValue,
} from "../.test-build/crypto.js";

test("encrypt and decrypt roundtrip successfully with correct passphrase", async () => {
  const secret = "super-secret-token-12345!@#$%^&*()_+";
  const pass = "my-secure-passphrase";

  const bundle = await encrypt(secret, pass);
  assert.ok(bundle.salt, "bundle must have salt");
  assert.ok(bundle.iv, "bundle must have iv");
  assert.ok(bundle.data, "bundle must have data");

  const recovered = await decrypt(bundle, pass);
  assert.equal(recovered, secret);
});

test("decrypt throws when wrong passphrase is provided", async () => {
  const secret = "confidential-data";
  const bundle = await encrypt(secret, "correct-pass");

  await assert.rejects(
    async () => {
      await decrypt(bundle, "wrong-pass");
    },
    /operation failed|OperationError|ciphertext/i
  );
});

test("encryptValue and decryptValue handle stringified single-value tokens", async () => {
  const token = "ya29.a0AfH6SM...";
  const pass = "passphrase-999";

  const encrypted = await encryptValue(token, pass);
  assert.equal(typeof encrypted, "string");
  assert.equal(encrypted.split(":").length, 3);

  const decrypted = await decryptValue(encrypted, pass);
  assert.equal(decrypted, token);
});

test("decryptValue throws on invalid format", async () => {
  await assert.rejects(
    async () => {
      await decryptValue("only-one-part", "pass");
    },
    /Invalid encrypted value format/
  );

  await assert.rejects(
    async () => {
      await decryptValue("part1:part2", "pass");
    },
    /Invalid encrypted value format/
  );
});

test("hashPassphrase produces deterministic SHA-256 base64 hash", async () => {
  const hash1 = await hashPassphrase("test-passphrase");
  const hash2 = await hashPassphrase("test-passphrase");
  const hashDiff = await hashPassphrase("different-passphrase");

  assert.equal(typeof hash1, "string");
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hashDiff);
});
