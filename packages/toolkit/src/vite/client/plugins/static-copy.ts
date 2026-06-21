import type { Plugin } from "vite";
import fs from "fs";
import path from "path";

function staticCopy(options: {
  targets: { src: string; dest: string }[];
}): Plugin {
  const { targets } = options;

  return {
    name: "vite-plugin-node-red:client:static-copy",
    apply: "build",
    enforce: "post",

    closeBundle() {
      for (const { src, dest } of targets) {
        if (!fs.existsSync(src)) continue;

        fs.mkdirSync(dest, { recursive: true });

        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          const files = fs.readdirSync(src);
          for (const file of files) {
            const srcFile = path.join(src, file);
            const destFile = path.join(dest, file);
            const fileStat = fs.statSync(srcFile);

            if (fileStat.isDirectory()) {
              fs.cpSync(srcFile, destFile, { recursive: true });
            } else {
              fs.copyFileSync(srcFile, destFile);
            }
          }
        } else {
          fs.copyFileSync(src, dest);
        }
      }
    },
  };
}

export { staticCopy };
