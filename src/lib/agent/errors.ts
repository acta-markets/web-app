import { ActaHttpError } from "@acta-markets/ts-sdk/http";
import { ActaWsRequestError, type ServerError } from "@acta-markets/ts-sdk/ws";

/**
 * What a tool tells an agent when it cannot do what was asked: a code it can branch on, what to
 * do next, and a sentence. Text that came from the backend or a maker never reaches the agent
 * as it arrived: it is cut to plain characters first, so it cannot carry instructions.
 */
export type AgentAction =
  /** try the same call again */
  | "retry"
  /** the input is wrong; change it */
  | "fix_request"
  /** the outcome is not known; look the order up, never repeat the trade */
  | "reconcile"
  /** nothing the agent can do in this call */
  | "stop";

export class AgentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly action: AgentAction = "fix_request",
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

/** Backend text reduced to what a number, a name or a short sentence needs. */
export function plainText(value: unknown, max = 200): string {
  return String(value ?? "")
    .replace(/[^A-Za-z0-9 _.,:;=()\/%+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** A token symbol as the backend names it, if it is shaped like one; null otherwise. */
export function plainSymbol(value: unknown): string | null {
  // letters, digits, a dot or a hyphen: "USDC-Dev", "BRK.B". Nothing a sentence could hide in.
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9.-]{0,15}$/.test(value) ? value : null;
}

const ACTIONS: Record<string, AgentAction> = {
  retry: "retry",
  refresh: "retry",
  reauthenticate: "retry",
  reconcile: "reconcile",
  fix_request: "fix_request",
  stop: "stop",
};

/** The venue's code for a refused request: `market_not_found`, `insufficient_collateral`, and so on. */
export function serverCode(error: unknown): string | null {
  if (error instanceof ActaHttpError) return error.code;
  if (!(error instanceof ActaWsRequestError) || !error.error) return null;
  return serverErrorCode(error.error);
}

export function serverErrorCode(server: ServerError): string {
  return server.type === "Generic" ? String(server.data.code) : String(server.type);
}

export function toAgentError(error: unknown): AgentError {
  if (error instanceof AgentError) return error;
  if (error instanceof ActaWsRequestError) {
    const server = error.error;
    // The venue's own failures arrive as `Generic` with the code that says which one.
    const code = serverCode(error) ?? error.kind;
    const detail = server && "data" in server && server.data && typeof server.data === "object" && "message" in server.data
      ? plainText((server.data as { message?: unknown }).message)
      : "";
    return new AgentError(
      plainText(code, 60) || "request_failed",
      detail ? `The venue refused the request: ${detail}` : `The venue refused the request (${plainText(code, 60)}).`,
      ACTIONS[error.action] ?? "stop",
    );
  }
  if (error instanceof ActaHttpError) {
    return new AgentError(plainText(error.code, 60) || "request_failed", `The venue refused the request (${plainText(error.code, 60)}).`, error.retryable ? "retry" : "stop");
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AgentError("internal", plainText(message, 300) || "Unexpected failure", "stop");
}
