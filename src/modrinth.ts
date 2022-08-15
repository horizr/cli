import { IterableElement } from "type-fest"
import originalGot, { HTTPError, Response } from "got"
import { sortBy } from "lodash-es"
import { Loader, Mod, Pack, usePack } from "./pack.js"
import { ModFile, ModFileData, ModFileModrinthSource } from "./files.js"
import { pathExists } from "fs-extra"
import kleur from "kleur"
import { nanoid } from "nanoid/non-secure"
import { KeyvFile } from "keyv-file"
import { resolve } from "path"
import { delay, paths } from "./utils.js"
import { output } from "./output.js"

const keyvCache = new KeyvFile({
  filename: resolve(paths.cache, "http.json"),
  writeDelay: 50,
  expiredCheckDelay: 24 * 3600 * 1000,
  encode: JSON.stringify,
  decode: JSON.parse
})

const got = originalGot.extend()

async function getModrinthApiOptional(url: string): Promise<any | null> {
  let response: Response

  while (true) {
    response = await got(url, {
      prefixUrl: "https://api.modrinth.com",
      headers: {
        "User-Agent": "moritzruth/horizr/1.0.0 (not yet public)"
      },
      cache: keyvCache,
      responseType: "json",
      throwHttpErrors: false
    })

    if (response.statusCode.toString().startsWith("2")) {
      // success
      return response.body
    } else if (response.statusCode === 404) {
      // not found
      return null
    } else if (response.statusCode === 429) {
      // rate limited
      const secondsUntilReset = Number(response.headers["x-ratelimit-reset"])
      output.warn(`Rate-limit exceeded. Retrying in ${kleur.yellow(secondsUntilReset)} seconds…`)
      await delay(secondsUntilReset * 1000)
    } else {
      output.failAndExit(`A request to the Modrinth API failed with status code ${kleur.yellow(response.statusCode)}.`)
    }
  }
}

async function getModrinthApi(url: string): Promise<any> {
  const response = await getModrinthApiOptional(url)
  if (response === null) return output.failAndExit("Request failed with status code 404.")
  return response
}

const dependencyToRelatedVersionType: Record<string, IterableElement<ModrinthVersion["relations"]>["type"]> = {
  required: "hard_dependency",
  optional: "soft_dependency",
  embedded: "embedded_dependency",
  incompatible: "incompatible"
}

export type ReleaseChannel = "alpha" | "beta" | "release"
export const releaseChannelOrder: ReleaseChannel[] = ["alpha", "beta", "release"]

export const sortModrinthVersionsByPreference = (versions: ModrinthVersion[]) => sortBy(versions, [v => releaseChannelOrder.indexOf(v.releaseChannel), "isFeatured", "publicationDate"]).reverse()

export async function findModForModrinthMod(modrinthMod: ModrinthMod): Promise<(Mod & { modFile: ModFile & { source: ModFileModrinthSource } }) | null> {
  const pack = await usePack()

  return (
    pack.mods.find(
      mod => mod.modFile.source.type === "modrinth" && mod.modFile.source.modId === modrinthMod.id
    ) as (Mod & { modFile: Mod & { source: ModFileModrinthSource } }) | undefined
  ) ?? null
}

export const isModrinthVersionCompatible = (modrinthVersion: ModrinthVersion, pack: Pack) =>
  modrinthVersion.supportedMinecraftVersions.includes(pack.horizrFile.versions.minecraft) && modrinthVersion.supportedLoaders.includes(pack.horizrFile.loader)

export function getModFileDataForModrinthVersion(modrinthMod: ModrinthMod, modrinthModVersion: ModrinthVersion): ModFileData {
  const modrinthVersionFile = findCorrectModVersionFile(modrinthModVersion.files)

  return {
    version: modrinthModVersion.versionString,
    hash: modrinthVersionFile.hashes.sha512,
    hashAlgorithm: "sha512",
    downloadUrl: modrinthVersionFile.url,
    name: modrinthVersionFile.fileName,
    size: modrinthVersionFile.sizeInBytes,
  }
}

export async function addModrinthMod(modrinthMod: ModrinthMod, modrinthVersion: ModrinthVersion) {
  const pack = await usePack()
  let id = modrinthMod.slug

  if (await pathExists(pack.resolvePath("mods", `${id}.json`))) {
    const oldId = id
    id = `${id}-${nanoid(5)}`

    output.warn(
      `There is already a mod file named ${kleur.yellow(`${oldId}.json`)} specifying a non-Modrinth mod.\n` +
        `The file for this mod will therefore be named ${kleur.yellow(`${id}.json`)}`
    )
  }

  const isClientSupported = modrinthMod.clientSide !== "unsupported"
  const isServerSupported = modrinthMod.serverSide !== "unsupported"

  await pack.addMod(id, {
    name: modrinthMod.title,
    enabled: true,
    ignoreUpdates: false,
    side: isClientSupported && isServerSupported ? "client+server" : isClientSupported ? "client" : "server",
    file: getModFileDataForModrinthVersion(modrinthMod, modrinthVersion),
    source: {
      type: "modrinth",
      modId: modrinthMod.id,
      versionId: modrinthVersion.id
    }
  })
}

export function findCorrectModVersionFile(files: ModrinthVersionFile[]) {
  const primary = files.find(file => file.isPrimary)

  if (primary !== undefined) return primary

  // shortest file name
  return files.sort((a, b) => a.fileName.length - b.fileName.length)[0]
}

function transformApiModVersion(raw: any): ModrinthVersion {
  return {
    id: raw.id,
    projectId: raw.project_id,
    name: raw.name,
    versionString: raw.version_number,
    releaseChannel: raw.version_type,
    isFeatured: raw.featured,
    publicationDate: new Date(raw.date_published),
    changelog: raw.changelog,
    supportedMinecraftVersions: raw.game_versions,
    supportedLoaders: raw.loaders,
    downloadsCount: raw.downloads,
    relations: raw.dependencies.map((dependency: any): ModrinthVersionRelation => ({
      type: dependencyToRelatedVersionType[dependency.dependency_type],
      versionId: dependency.version_id,
      projectId: dependency.project_id
    })),
    files: raw.files.map((file: any): ModrinthVersionFile => ({
      isPrimary: file.primary,
      hashes: file.hashes,
      fileName: file.filename,
      url: file.url,
      sizeInBytes: file.size
    }))
  }
}

export interface PaginationOptions {
  limit: number
  skip: number
}

type ProjectOrVersionId = {
  versionId: string
  projectId: string | null
} | {
  versionId: string | null
  projectId: string
}

export interface ModrinthMod {
  id: string
  slug: string
  title: string
  description: string
  categories: string[]
  clientSide: "required" | "optional" | "unsupported"
  serverSide: "required" | "optional" | "unsupported"
  downloadsCount: number
  licenseCode: string
  creationDate: Date
  updateDate: Date
}

export type ModrinthVersionRelation = ProjectOrVersionId & {
  type: "hard_dependency" | "soft_dependency" | "embedded_dependency" | "incompatible"
}

export interface ModrinthVersion {
  id: string
  projectId: string
  name: string
  versionString: string
  releaseChannel: ReleaseChannel
  isFeatured: boolean
  publicationDate: Date
  changelog: string | null
  supportedMinecraftVersions: string[]
  supportedLoaders: string[]
  downloadsCount: number
  relations: ModrinthVersionRelation[]
  files: ModrinthVersionFile[]
}

export interface ModrinthVersionFile {
  hashes: Record<"sha512" | "sha1", string>
  url: string
  fileName: string
  isPrimary: boolean
  sizeInBytes: number
}

export const modrinthApi = {
  clearCache: () => keyvCache.clear(),
  async searchMods(
    loader: Loader,
    minecraftVersion: string,
    query: string,
    pagination: PaginationOptions
  ): Promise<{ total: number; results: ModrinthMod[] }> {
    const facets = `[["categories:${loader}"],["versions:${minecraftVersion}"],["project_type:mod"]]`

    const response = await getModrinthApi(`v2/search?query=${encodeURIComponent(query)}&limit=${pagination.limit}&offset=${pagination.skip}&facets=${facets}`)

    return {
      total: response.total_hits,
      results: response.hits.map((hit: any): ModrinthMod => ({
        id: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        description: hit.description,
        categories: hit.categories,
        clientSide: hit.client_side,
        serverSide: hit.server_side,
        downloadsCount: hit.downloads,
        licenseCode: hit.license,
        creationDate: new Date(hit.date_created),
        updateDate: new Date(hit.date_modified)
      }))
    }
  },
  async getMod(idOrSlug: string): Promise<ModrinthMod | null> {
    const response = await getModrinthApiOptional(`v2/project/${idOrSlug}`)
    if (response === null) return null

    return {
      id: response.id,
      slug: response.slug,
      title: response.title,
      description: response.description,
      categories: response.categories,
      clientSide: response.client_side,
      serverSide: response.server_side,
      downloadsCount: response.downloads,
      licenseCode: response.license.id,
      creationDate: new Date(response.published),
      updateDate: new Date(response.updated)
    }
  },
  async listVersions(idOrSlug: string, loader: Loader, minecraftVersion: string): Promise<ModrinthVersion[]> {
    const response = await getModrinthApi(`v2/project/${idOrSlug}/version?loaders=["${loader}"]&game_versions=["${minecraftVersion}"]`)

    return response.map(transformApiModVersion)
  },
  async getVersion(id: string): Promise<ModrinthVersion | null> {
    try {
      const response = await getModrinthApiOptional(`v2/version/${id}`)

      return transformApiModVersion(response)
    } catch (e: unknown) {
      if (e instanceof HTTPError && e.response.statusCode === 404) return null
      throw e
    }
  }
}
