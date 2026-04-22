import { execSync } from "child_process";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { build as viteBuild } from "vite";
import vue from "@vitejs/plugin-vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

execSync(
  "esbuild server/index.ts --bundle --packages=external --format=cjs --platform=node --outfile=dist/server/index.cjs",
  { stdio: "inherit" },
);

execSync("./node_modules/.bin/tsc -p tsconfig.server.json --emitDeclarationOnly", { stdio: "inherit" });
console.log("✓ Generated type declarations");

mkdirSync("dist/resources", { recursive: true });

const vueProdFile = require.resolve("vue/dist/vue.esm-browser.prod.js");
copyFileSync(vueProdFile, path.resolve(__dirname, "dist/resources/vue.esm-browser.prod.js"));
console.log("✓ Copied vue.esm-browser.prod.js to dist/resources/");

await viteBuild({
  configFile: false,
  logLevel: "warn",
  plugins: [vue()],
  build: {
    outDir: path.resolve(__dirname, "dist/resources"),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "client/index.ts"),
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
console.log("✓ Built nrg-client.js to dist/resources/");

// Inline the extracted CSS into nrg-client.js so styles are injected when the script loads
const cssPath = path.resolve(__dirname, "dist/resources/nrg-client.css");
if (existsSync(cssPath)) {
  const css = readFileSync(cssPath, "utf-8");
  const jsPath = path.resolve(__dirname, "dist/resources/nrg-client.js");
  const js = readFileSync(jsPath, "utf-8");
  const inject = `(function(){var s=document.createElement("style");s.textContent=${JSON.stringify(css)};document.head.appendChild(s);})();\n`;
  writeFileSync(jsPath, inject + js);
  unlinkSync(cssPath);
  console.log("✓ Inlined nrg-client.css into nrg-client.js");
}
