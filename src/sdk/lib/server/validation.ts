import { Validator } from "../shared/validator";
import type { RED } from "./red";

function initValidator(RED: RED): void {
  if (RED.validator) return;

  const nrg = {
    validator: new Validator({
      customKeywords: [
        {
          keyword: "x-nrg-skip-validation",
          schemaType: "boolean",
          valid: true,
        },
        {
          keyword: "x-nrg-node-type",
          type: "string",
          validate: (schemaValue: string, dataValue: string) => {
            if (!dataValue) return true;
            const node = RED.nodes.getNode(dataValue);
            return node?.type === schemaValue;
          },
        },
      ],
      customFormats: {
        "node-id": /^[a-zA-Z0-9-_]+$/,
      },
    }),
  };

  Object.defineProperty(RED, "_nrg", {
    value: nrg,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  Object.defineProperty(RED, "validator", {
    get: () => nrg.validator,
    enumerable: false,
    configurable: false,
  });
}

export { initValidator };
