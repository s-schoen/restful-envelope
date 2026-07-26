/** A successful response containing a page of resource representations. */
export interface CollectionResponse<T extends object> {
  /** The resource representations in this page. */
  data: T[];

  /** Metadata describing this page and how to continue through the collection. */
  pagination: {
    /** The zero-based position of the first resource in this page. */
    offset: number;

    /** The effective maximum number of resources in this page. */
    limit: number;

    /** The offset for the next page, or `null` when this is the final page. */
    nextOffset: number | null;

    /** The number of matching resources before pagination, when provided by the endpoint. */
    total?: number;
  };
}

/**
 * Wraps resource representations and pagination metadata in a collection response envelope.
 */
export function createCollectionResponse<T extends object>(
  data: T[],
  pagination: CollectionResponse<T>["pagination"],
): CollectionResponse<T> {
  return { data, pagination };
}

/**
 * Wraps a complete resource collection in an envelope that has no following page.
 */
export function createUnpaginatedCollectionResponse<T extends object>(
  data: T[],
): CollectionResponse<T> {
  return createCollectionResponse(data, {
    offset: 0,
    limit: Math.max(1, data.length),
    nextOffset: null,
    total: data.length,
  });
}
