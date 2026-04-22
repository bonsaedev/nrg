import { Validator } from "../validator";
import type { RED } from "./types";
declare class NodeRedValidator extends Validator {
    constructor(RED: RED);
}
export declare let validator: NodeRedValidator;
export declare function initValidator(RED: RED): void;
export {};
