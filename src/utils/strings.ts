export const orEmptyString =
  <T>(value: T, fn: (v: Exclude<T, undefined | null>) => string): string =>
    value === undefined || value === null ? "" : fn(value as Exclude<T, undefined | null>)

export function truncateWithEllipsis(text: string, maxLength: number) {
  if (text.length <= maxLength) return text

  return text.slice(0, maxLength - 1).trimEnd() + "…"
}
