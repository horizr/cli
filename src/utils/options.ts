import { InvalidArgumentError } from "commander"
import { Side, sides } from "../pack.js"

export function integerOption(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed)) throw new InvalidArgumentError("Must be an integer.")

  return parsed
}

export function positiveIntegerOption(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 0) throw new InvalidArgumentError("Must be a positive integer.")

  return parsed
}

export function gtzIntegerOption(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed <= 0) throw new InvalidArgumentError("Must be an integer > 0.")

  return parsed
}

export function sideOption(value: string): Side {
  if (!(sides as string[]).includes(value)) throw new InvalidArgumentError(`Must be one of ${sides.join(", ")}`)

  return value as Side
}
