import { InvalidArgumentError } from "commander"
import hash, { HashaInput } from "hasha"
import { Path, paths } from "./path.js"
import { ZipFile } from "yazl"
import { walk } from "@root/walk"
import fs from "fs-extra"
import { pEvent } from "p-event"
import serveHandler from "serve-handler"
import * as http from "http"
import addressWithCallback from "address"
import { promisify } from "util"
import { KeyvFile } from "keyv-file"
import originalGot from "got"
import { dirname } from "path"
import { without } from "lodash-es"

const keyvCache = new KeyvFile({
  filename: paths.cache.resolve("http.json").toString(),
  writeDelay: 50,
  expiredCheckDelay: 24 * 3600 * 1000,
  encode: JSON.stringify,
  decode: JSON.parse
})

export const clearCache = () => keyvCache.clear()

export const got = originalGot.extend({
  cache: keyvCache,
  responseType: "json",
  headers: {
    "User-Agent": "moritzruth/horizr/1.0.0 (not yet public)"
  }
})

const address = promisify(addressWithCallback)
export const getLANAddress = () => address().then(r => r.ip)

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

export function httpServeDirectory(path: Path, port: number, expose: boolean, onListen: () => void) {
  const server = http.createServer((request, response) => {
    return serveHandler(request, response, {
      directoryListing: false,
      public: path.toString(),
      cleanUrls: false,
      headers: [
        {
          source: "**/*.toml",
          headers: [{
            key: "Content-Type",
            value: "application/toml"
          }]
        }
      ]
    })
  })

  server.listen(port, expose ? "0.0.0.0" : "127.0.0.1", () => {
    onListen()
  })
}

export async function zipDirectory(directoryPath: Path, outputFilePath: Path) {
  const zipFile = new ZipFile()
  zipFile.outputStream.pipe(fs.createWriteStream(outputFilePath.toString()))

  let emptyDirectories: string[] = []
  await walk(directoryPath.toString(), async (error, path, dirent) => {
    if (error) return
    if (directoryPath.toString() === path) return true
    if (dirent.name.startsWith(".")) return false

    if (dirent.isDirectory()) {
      emptyDirectories.push(path)
    } else if (dirent.isFile()) {
      zipFile.addFile(path, directoryPath.relative(path).toString(), { compress: true })
    } else return

    emptyDirectories = without(emptyDirectories, dirname(path))
  })

  emptyDirectories.forEach(p => zipFile.addEmptyDirectory(directoryPath.relative(p).toString()))

  zipFile.end()
  await pEvent(zipFile.outputStream, "close")
}

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
