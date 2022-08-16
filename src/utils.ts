import { InvalidArgumentError } from "commander"
import hash, { HashaInput } from "hasha"
import { Path } from "./path.js"
import { ZipFile } from "yazl"
import { walk } from "@root/walk"
import fs from "fs-extra"
import { pEvent } from "p-event"
import serveHandler from "serve-handler"
import * as http from "http"
import addressWithCallback from "address"
import { promisify } from "util"

const address = promisify(addressWithCallback)

export const getLANAddress = () => address().then(r => r.ip)

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

  await walk(directoryPath.toString(), async (error, path, dirent) => {
    if (error) return
    if (directoryPath.toString() === path) return true
    if (dirent.name.startsWith(".")) return false

    if (dirent.isFile()) zipFile.addFile(path, directoryPath.relative(Path.create(path)).toString(), { compress: true })
  })

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
