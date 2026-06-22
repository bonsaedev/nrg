import { defineConfig } from "vite";
import { nrg } from "@bonsae/nrg/vite";

export default defineConfig({
  plugins: [
    nrg({
      build: {
        extraFilesCopyTargets: [],
      },
    }),
  ],
});
