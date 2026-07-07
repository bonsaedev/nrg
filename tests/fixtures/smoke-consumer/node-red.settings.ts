import { defineNodeRedSettings } from "@bonsae/nrg/vite";

// Exercises the settings-helper redirect end-to-end against the PACKED tarball:
// the smoke `dev` boot bundles this file into Node-RED's runtime settings, so the
// settings compiler must resolve `@bonsae/nrg/vite` to the shipped dependency-free
// leaf. If the leaf didn't ship, or the redirect broke, this would drag the vite
// plugin's native deps (chokidar→fsevents, vite→lightningcss) into the settings
// bundle and the dev boot would fail — proving both that the leaf ships and that
// the redirect keeps the plugin out.
export default defineNodeRedSettings({
  flowFilePretty: true,
});
