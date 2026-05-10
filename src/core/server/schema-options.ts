export interface NrgSchemaExtensions {
  exportable?: boolean;
  "x-nrg-node-type"?: string;
  "x-nrg-form"?: {
    icon?: string;
    typedInputTypes?: string[];
    editorLanguage?: string;
    toggle?: boolean;
  };
}
