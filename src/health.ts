/** The aggregate or component-level state reported by a health response. */
export type HealthStatus = "healthy" | "unhealthy" | "degraded";

/** The health state of a component or dependency used by a service. */
export interface ComponentHealthStatus {
  /** The name of the component or dependency. */
  name: string;

  /** The current health state of the component or dependency. */
  status: HealthStatus;

  /** Human-readable information about the current health state. */
  detail?: string;
}

/** The aggregate health of a service and, optionally, its components. */
export interface HealthResponse {
  /** The aggregate health state of the service. */
  status: HealthStatus;

  /** A stable identifier for the service. */
  service?: string;

  /** Health information for components or dependencies used by the service. */
  components?: ComponentHealthStatus[];
}

/**
 * Returns the HTTP status code corresponding to a health response.
 *
 * Healthy and degraded responses map to `200`; unhealthy responses map to `503`.
 *
 * @param response - The health response whose aggregate status determines the HTTP status.
 * @returns `200` when the service is healthy or degraded, otherwise `503`.
 */
export function getHealthHTTPStatusCode(response: HealthResponse): 200 | 503 {
  switch (response.status) {
    case "healthy":
    case "degraded":
      return 200;
    case "unhealthy":
      return 503;
  }
}
