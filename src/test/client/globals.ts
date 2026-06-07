import type { MockRED } from "./mocks";
import type { createJQuery } from "./mocks";

declare global {
  interface Window {
    RED: MockRED;
    $: ReturnType<typeof createJQuery>;
  }
}

export {};
