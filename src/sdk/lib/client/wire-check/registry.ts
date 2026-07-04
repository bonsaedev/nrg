/**
 * The set of node types nrg has registered in this editor session. All nrg
 * packages share ONE content-hashed client asset (evaluated once), so every
 * `registerType` call — across every installed nrg package — records here. The
 * wire checker uses it to tell an nrg endpoint (which carries a resolvable
 * owning module) from a plain Node-RED node (reported as "not an nrg node").
 */
const nrgTypes = new Set<string>();

function registerNrgType(type: string): void {
  nrgTypes.add(type);
}

function isNrgType(type: string): boolean {
  return nrgTypes.has(type);
}

export { registerNrgType, isNrgType };
