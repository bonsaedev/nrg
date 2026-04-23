/**
 * Global type declarations for the Node-RED editor environment.
 * These are provided by Node-RED at runtime, not imported.
 */

// jQuery — injected by Node-RED editor
declare const $: any;

// Node-RED editor API — injected by Node-RED editor
declare const RED: {
  nodes: {
    registerType(type: string, definition: any): void;
    node(id: string): any;
    dirty(): boolean;
  };
  [key: string]: any;
};
