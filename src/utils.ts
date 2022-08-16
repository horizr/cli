import { InvalidArgumentError } from "commander"
import hash, { HashaInput } from "hasha"
import { zip as zipWithCallback } from "cross-zip"
import { promisify } from "util"

export const zip = promisify(zipWithCallback)

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const getSha512HexHash = (input: HashaInput) => hash.async(input, { algorithm: "sha512", encoding: "hex" })

export function truncateWithEllipsis(text: string, maxLength: number) {
  if (text.length <= maxLength) return text

  return text.slice(0, maxLength - 1).trimEnd() + "…"
}

export function optionParseInteger(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed)) throw new InvalidArgumentError("Must be an integer.")

  return parsed
}

export function optionParsePositiveInteger(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 0) throw new InvalidArgumentError("Must be a positive integer.")

  return parsed
}
