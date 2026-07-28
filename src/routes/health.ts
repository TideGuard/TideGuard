import type { HealthResponse } from "../core/types";
import { jsonOk } from "../core/errors";
import { VERSION } from "../version";

export function handleHealth(env: Env): Response {
  const body: HealthResponse = {
    status: "ok",
    service: "tideguard",
    version: VERSION,
    environment: env.ENVIRONMENT,
    time: new Date().toISOString(),
  };

  return jsonOk(body);
}
