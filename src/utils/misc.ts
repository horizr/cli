import { promisify } from "util"
import addressWithCallback from "address"
import hash, { HashaInput } from "hasha"
import { AbsolutePath } from "./path.js"

const address = promisify(addressWithCallback)
export const getLANAddress = () => address().then(r => r.ip)

export const computeSha512HexHash = (input: HashaInput) => hash.async(input, { algorithm: "sha512", encoding: "hex" })
export const computeSha512HexHashForFile = (path: AbsolutePath) => hash.fromFile(path.toString(), { algorithm: "sha512", encoding: "hex" })
