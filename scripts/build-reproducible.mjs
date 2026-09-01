import { createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const configuredKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY?.trim();
if (!configuredKey || Buffer.from(configuredKey, "base64").length !== 32) {
  throw new Error(
    "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
  );
}

async function replaceOnce(path, original, replacement) {
  const content = await readFile(path, "utf8");
  if (content.includes(replacement)) return;
  const occurrences = content.split(original).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Expected one reproducibility patch point in ${path}; found ${occurrences}`);
  }
  await writeFile(path, content.replace(original, replacement));
}

await replaceOnce(
  "node_modules/next/dist/server/app-render/encryption-utils.js",
  "async function generateEncryptionKeyBase64(dev) {\n    // For development, we just keep one key in memory for all actions.",
  "async function generateEncryptionKeyBase64(dev) {\n    const configuredKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;\n    if (configuredKey) return configuredKey;\n    // For development, we just keep one key in memory for all actions.",
);

await replaceOnce(
  "node_modules/next/dist/build/index.js",
  `const previewProps = {
                previewModeId: _crypto.default.randomBytes(16).toString("hex"),
                previewModeSigningKey: _crypto.default.randomBytes(32).toString("hex"),
                previewModeEncryptionKey: _crypto.default.randomBytes(32).toString("hex")
            };`,
  `const previewProps = {
                previewModeId: process.env.__NEXT_PREVIEW_MODE_ID,
                previewModeSigningKey: process.env.__NEXT_PREVIEW_MODE_SIGNING_KEY,
                previewModeEncryptionKey: process.env.__NEXT_PREVIEW_MODE_ENCRYPTION_KEY
            };`,
);

function derive(label, length) {
  return createHmac("sha256", Buffer.from(configuredKey, "base64"))
    .update(label)
    .digest("hex")
    .slice(0, length);
}

const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  {
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      __NEXT_PREVIEW_MODE_ID: derive("umai-preview-id", 32),
      __NEXT_PREVIEW_MODE_SIGNING_KEY: derive("umai-preview-signing", 64),
      __NEXT_PREVIEW_MODE_ENCRYPTION_KEY: derive("umai-preview-encryption", 64),
    },
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const normalized = spawnSync(process.execPath, ["scripts/normalize-next-build.mjs"], {
  stdio: "inherit",
});
if (normalized.error) throw normalized.error;
process.exit(normalized.status ?? 1);
