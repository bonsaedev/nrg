import type { WireCheckRequest, WireCheckResult } from "./plan";

/**
 * Transport to the type-check plugin's admin routes. URLs are root-relative
 * (`nrg/type-check`, no leading slash) so they honor a custom `httpAdminRoot`,
 * and they go through jQuery `$.ajax` — which inherits Node-RED's global
 * `$.ajaxSetup` bearer token, so requests authenticate like every other editor
 * admin call. Every failure resolves to null (never rejects): if the plugin
 * isn't installed the routes don't exist, and a wire check must fail OPEN rather
 * than surface an error to the author.
 */

const ENDPOINT = "nrg/type-check";

interface TypeCheckStatus {
  /** The plugin is installed and its routes are reachable. */
  available: boolean;
}

function postJson(url: string, body: unknown): Promise<unknown | null> {
  return new Promise((resolve) => {
    try {
      $.ajax({
        url,
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify(body),
        dataType: "json",
        success: (res: unknown) => resolve(res),
        error: () => resolve(null),
      });
    } catch {
      resolve(null);
    }
  });
}

function getJson(url: string): Promise<unknown | null> {
  return new Promise((resolve) => {
    try {
      $.ajax({
        url,
        method: "GET",
        dataType: "json",
        success: (res: unknown) => resolve(res),
        error: () => resolve(null),
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Probe whether the type-check plugin is installed (its routes are reachable).
 * Absent plugin → the route 404s → null → unavailable. Installing the plugin
 * turns the feature on; there is no setting. Drives whether the editor renders
 * the Validate Types toggle and hooks the wire events.
 */
async function fetchStatus(): Promise<TypeCheckStatus> {
  const res = await getJson(`${ENDPOINT}/status`);
  return {
    available: (res as Partial<TypeCheckStatus> | null)?.available === true,
  };
}

function isResult(value: unknown): value is WireCheckResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WireCheckResult).ok === "boolean"
  );
}

async function checkWire(
  req: WireCheckRequest,
): Promise<WireCheckResult | null> {
  const res = await postJson(ENDPOINT, req);
  return isResult(res) ? res : null;
}

async function checkWires(
  reqs: WireCheckRequest[],
): Promise<WireCheckResult[] | null> {
  const res = await postJson(`${ENDPOINT}/batch`, { wires: reqs });
  const results = (res as { results?: unknown })?.results;
  return Array.isArray(results) && results.every(isResult) ? results : null;
}

export { checkWire, checkWires, fetchStatus };
export type { TypeCheckStatus };
