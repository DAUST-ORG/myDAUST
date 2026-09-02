/**
 * Decode a successful API response without turning Nest's empty `null` response
 * into an empty string. Nullable read endpoints intentionally use an empty body
 * when no record exists.
 */
export function parseSuccessfulApiResponse<T>(
  text: string,
  contentType: string,
): T {
  if (text.trim().length === 0) return null as T;
  return (
    contentType.includes("application/json") ? JSON.parse(text) : text
  ) as T;
}
