import { execSync } from "child_process";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { build as viteBuild } from "vite";
import vue from "@vitejs/plugin-vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Phase 1: Build server (CJS)
execSync(
  "esbuild src/core/server/index.ts --bundle --packages=external --format=cjs --platform=node --outfile=build/server/index.cjs",
  { stdio: "inherit" },
);
console.log("✓ Built server to build/server/");

// Phase 2: Copy Vue runtime
mkdirSync("build/server/resources", { recursive: true });

const vueProdFile = require.resolve("vue/dist/vue.esm-browser.prod.js");
copyFileSync(vueProdFile, path.resolve(__dirname, "build/server/resources/vue.esm-browser.prod.js"));
console.log("✓ Copied vue.esm-browser.prod.js to build/server/resources/");

// Phase 3: Build client (ESM library)
await viteBuild({
  configFile: false,
  logLevel: "warn",
  plugins: [vue()],
  build: {
    outDir: path.resolve(__dirname, "build/server/resources"),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "src/core/client/index.ts"),
      name: "NrgClient",
      fileName: "nrg-client",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["vue"],
      output: {
        paths: { vue: "/nrg/assets/vue.esm-browser.prod.js" },
      },
    },
  },
});
console.log("✓ Built nrg-client.js to build/server/resources/");

// Inline the extracted CSS into nrg-client.js so styles are injected when the script loads
const cssPath = path.resolve(__dirname, "build/server/resources/nrg-client.css");
if (existsSync(cssPath)) {
  const css = readFileSync(cssPath, "utf-8");
  const jsPath = path.resolve(__dirname, "build/server/resources/nrg-client.js");
  const js = readFileSync(jsPath, "utf-8");
  const inject = `(function(){var s=document.createElement("style");s.textContent=${JSON.stringify(css)};document.head.appendChild(s);})();\n`;
  writeFileSync(jsPath, inject + js);
  unlinkSync(cssPath);
  console.log("✓ Inlined nrg-client.css into nrg-client.js");
}

// Phase 4: Build vite plugin (ESM)
execSync(
  "esbuild src/vite/index.ts src/vite/utils.ts --bundle --packages=external --format=esm --platform=node --outdir=build/vite",
  { stdio: "inherit" },
);
console.log("✓ Built vite plugin to build/vite/");
