# Client Unit Testing

Unit-test the plain TypeScript in your client plane — helpers, validation, and registration logic — without a browser.

Client unit tests cover pure TypeScript logic — validation functions, formatters, utility modules, etc. They run in a [happy-dom](https://github.com/capricorn86/happy-dom) environment with mocked `RED` and `$` globals, but without rendering Vue components.

### Setup

#### 1. Install dependencies

```bash
pnpm add -D vitest happy-dom
```

`happy-dom` provides the DOM environment the client unit config runs in (`environment: "happy-dom"`).

#### 2. Create a tsconfig

```json
// tests/client/unit/tsconfig.json
{
  "extends": "@bonsae/nrg/tsconfig/test/client/unit.json",
  "include": ["**/*.ts", "../../../src/client/**/*.ts"]
}
```

#### 3. Create a vitest config

```typescript
// vitest.client.unit.config.ts
import { defineConfig, mergeConfig } from "vitest/config";
import { nrg } from "@bonsae/nrg/test/client/unit/config";

export default mergeConfig(
  nrg,
  defineConfig({
    test: {
      include: ["tests/client/unit/**/*.test.ts"],
    },
  }),
);
```

The `nrg` config provides:

- `testTimeout: 30_000`
- `environment: "happy-dom"` for `window`, `document`, and other browser globals
- `setupFiles` pointing to the built-in setup that installs `RED` and `$` mocks on `window`
- `@` alias pointing to `src/` in your project root
- `@bonsae/nrg/client` alias resolved to the test library (so `useFormNode` imports work without a runtime bundle)
- a default `include` of `tests/client/unit/**/*.test.ts`

#### 4. Add a test script

```json
{
  "scripts": {
    "test:client:unit": "vitest run --config vitest.client.unit.config.ts"
  }
}
```

### Quick Start

```typescript
import { describe, it, expect } from "vitest";
import { validateNode } from "../../../src/client/validation";

describe("validateNode", () => {
  it("returns true for valid config", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
      },
      required: ["name"],
    };
    const subject = { type: "my-node", name: "test" };

    expect(validateNode(subject, schema)).toBe(true);
  });

  it("returns errors for missing required field", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
      },
      required: ["name"],
    };
    const subject = { type: "my-node", name: "" };
    const result = validateNode(subject, schema);

    expect(result).not.toBe(true);
    expect(result).toContain("must NOT have fewer than 1 characters");
  });
});
```
