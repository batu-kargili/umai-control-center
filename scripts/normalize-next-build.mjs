import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

async function normalizeJson(path) {
  const parsed = JSON.parse(await readFile(path, "utf8"));
  // Node File Trace discovers dependencies concurrently, so this set-like array
  // is emitted in scheduler order. Sorting it does not change runtime semantics.
  if (path.endsWith(".nft.json") && Array.isArray(parsed.files)) parsed.files.sort();
  await writeFile(path, `${JSON.stringify(canonicalize(parsed))}\n`);
}

async function normalizeClientReferenceManifest(path) {
  const content = await readFile(path, "utf8");
  const marker = '={"moduleLoading"';
  const start = content.indexOf(marker);
  if (start < 0) throw new Error(`Unexpected client reference manifest: ${path}`);
  const parsed = JSON.parse(content.slice(start + 1));
  await writeFile(path, `${content.slice(0, start + 1)}${JSON.stringify(canonicalize(parsed))}\n`);
}

async function walk(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && entry.name.endsWith(".json")) await normalizeJson(path);
    else if (entry.isFile() && entry.name.endsWith("_client-reference-manifest.js"))
      await normalizeClientReferenceManifest(path);
  }
}

await rm(join(".next", "cache"), { recursive: true, force: true });
await rm(join(".next", "trace"), { force: true });
await rm(join("node_modules", ".cache"), { recursive: true, force: true });
await walk(".next");
