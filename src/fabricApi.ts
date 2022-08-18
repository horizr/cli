import { got } from "./utils/http.js"

export async function fetchFabricMinecraftVersions(): Promise<string[]> {
  const versions = await got("https://meta.fabricmc.net/v1/versions/game").json<any[]>()
  return versions.map(version => version.version as string)
}

export async function fetchFabricVersions(minecraftVersion: string): Promise<string[]> {
  const versions = await got(`https://meta.fabricmc.net/v1/versions/loader/${minecraftVersion}`).json<any[]>()
  return versions.map(version => version.loader.version)
}
