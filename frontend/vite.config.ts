import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Fills the precache list + version of dist/sw.js with every file of the build,
// so one online visit caches the whole app shell for offline use.
function swPrecache(): Plugin {
  let outDir = "dist";
  return {
    name: "sahayam-sw-precache",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const walk = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
        );
      const files = walk(outDir)
        .map((f) => "/" + relative(outDir, f).split("\\").join("/"))
        .filter((f) => f !== "/sw.js" && !f.endsWith(".map"))
        .sort();
      const hash = createHash("sha256");
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const swPath = join(outDir, "sw.js");
      const sw = readFileSync(swPath, "utf8")
        .replace('const VERSION = "dev";', `const VERSION = "${hash.digest("hex").slice(0, 12)}";`)
        .replace("[] /* __PRECACHE__ */", JSON.stringify(files));
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  plugins: [react(), swPrecache()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/webhook": "http://localhost:8000",
    },
  },
});
