import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function hashTree(hash, root, directory) {
  for (const name of readdirSync(directory).sort()) {
    const absolute = join(directory, name);
    const metadata = statSync(absolute);
    if (metadata.isDirectory()) {
      hashTree(hash, root, absolute);
    } else if (metadata.isFile()) {
      hash.update(relative(root, absolute).replaceAll("\\", "/"));
      hash.update("\0");
      hash.update(readFileSync(absolute));
      hash.update("\0");
    }
  }
}

function deterministicBuildId() {
  const supplied = process.env.UMAI_BUILD_ID?.trim();
  if (supplied) return supplied;
  const root = process.cwd();
  const hash = createHash("sha256");
  for (const file of ["package.json", "package-lock.json", "next.config.mjs"])
    hash.update(readFileSync(join(root, file)));
  for (const directory of ["public", "src"]) hashTree(hash, root, join(root, directory));
  return `source-${hash.digest("hex").slice(0, 32)}`;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  generateBuildId: async () => deterministicBuildId(),
};

export default nextConfig;
