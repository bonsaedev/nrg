import { Validator } from "../validator";
import type { RED } from "./types";

let validator: Validator = undefined!;

function initValidator(RED: RED): void {
  validator = new Validator({
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
      "flow-id": /^[a-f0-9]{16}$/,
      "topic-path": (data: string) => /^[a-zA-Z0-9/_-]+$/.test(data),
    },
  });
}

export { validator, initValidator };
