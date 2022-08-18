export function mapNotNull<T, R>(array: T[], fn: (item: T, index: number) => R | null): R[] {
  const result: R[] = []

  let index = 0
  for (const item of array) {
    const mapped = fn(item, index)
    if (mapped !== null) result.push(mapped)
    index++
  }

  return result
}

export function filterNulls<T>(array: T[]): Exclude<T, null>[] {
  return array.filter(i => i !== null) as Exclude<T, null>[]
}
