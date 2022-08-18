import pLimit from "p-limit"
import os from "os"

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const createCpuCoreLimiter = () => pLimit(os.cpus().length)

export function createSingleConcurrencyWithQueue(fn: () => Promise<void>) {
  let state: "inactive" | "running_fresh" | "running_old" = "inactive"

  return async () => {
    if (state === "inactive") {
      const loop = () => {
        state = "running_fresh"

        fn().then(() => {
          if (state === "running_old") loop()
        })
      }

      loop()
    } else {
      state = "running_old"
    }
  }
}
