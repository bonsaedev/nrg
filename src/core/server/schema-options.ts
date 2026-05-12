export interface NrgSchemaExtensions {
  format?: "node-id" | "flow-id" | "topic-path" | (string & {});
  exportable?: boolean;
  "x-nrg-node-type"?: string;
  "x-nrg-form"?: {
    icon?: string;
    typedInputTypes?: string[];
    editorLanguage?: string;
    toggle?: boolean;
  };
}
