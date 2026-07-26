/** A successful response containing one resource representation. */
export interface ResourceResponse<T extends object> {
  /** The resource representation. */
  data: T;
}

/**
 * Wraps one resource representation in a response envelope.
 */
export function createResourceResponse<T extends object>(data: T): ResourceResponse<T> {
  return { data };
}
