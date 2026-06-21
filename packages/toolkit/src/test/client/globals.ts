import type { MockRED, MockJQuery } from "./mocks";

declare global {
  interface Window {
    RED: MockRED;
    $: MockJQuery;
  }
}

export {};
