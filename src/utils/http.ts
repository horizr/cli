import { KeyvFile } from "keyv-file"
import { Path, envPaths } from "./path.js"
import originalGot from "got"
import http from "http"
import serveHandler from "serve-handler"
import { getLANAddress } from "./misc.js"
import { output } from "./output.js"
import dedent from "dedent"
import kleur from "kleur"

const keyvCache = new KeyvFile({
  filename: envPaths.cache.resolve("http.json").toString(),
  writeDelay: 50,
  expiredCheckDelay: 24 * 3600 * 1000,
  encode: JSON.stringify,
  decode: JSON.parse
})

export const clearGotCache = () => keyvCache.clear()

export const got = originalGot.extend({
  cache: keyvCache,
  responseType: "json",
  headers: {
    "User-Agent": "moritzruth/horizr/1.0.0 (not yet public)"
  }
})

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

export async function httpServeDirectoryWithMessage(path: Path, port: number, expose: boolean) {
  const lanAddress = await getLANAddress()
  const localAddress = `http://localhost:${port}`

  await new Promise<void>(resolve => {
    httpServeDirectory(path, port, expose, () => {
      if (expose) {
        output.println(dedent`
          ${kleur.green("Serving at")}
            Local: ${kleur.yellow(localAddress)}
            Network: ${kleur.yellow(`http://${lanAddress}:${port}`)}
        `)
      } else output.println(`${kleur.green("Serving at")} ${kleur.yellow(localAddress)}`)

      resolve()
    })
  })
}
