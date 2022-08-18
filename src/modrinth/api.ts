import { HTTPError, Response } from "got"
import { output } from "../utils/output.js"
import kleur from "kleur"
import { got } from "../utils/http.js"
import { delay } from "../utils/promises.js"
import { dependencyToRelatedVersionType } from "./index.js"
import { ReleaseChannel } from "../pack.js"
import { orEmptyString } from "../utils/strings.js"

const BASE_URL = "https://api.modrinth.com"

async function getModrinthApiOptional(url: string): Promise<any | null> {
  let response: Response

  while (true) {
    response = await got(url, {
      prefixUrl: BASE_URL,
      throwHttpErrors: false,
      retry: {
        limit: 3,
        maxRetryAfter: 10,
        statusCodes: [
          408,
          413,
          // 429,
          500,
          502,
          503,
          504,
          521,
          522,
          524,
        ]
      },
      hooks: {
        beforeRetry: [
          (error, retryCount) => {
            output.warn(`Request to ${kleur.yellow(error.request!.requestUrl!.toString())} failed, retrying ${kleur.gray(`(${retryCount}/3)`)}`)
          }
        ]
      }
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
  if (response === null) return output.failAndExit(`Request failed with status code 404: ${kleur.yellow(BASE_URL + "/" + url)}`)
  return response
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
  async searchMods(
    minecraftVersion: string,
    query: string,
    pagination: PaginationOptions
  ): Promise<{ total: number; results: ModrinthMod[] }> {
    const facets = `[["categories:fabric"],["versions:${minecraftVersion}"],["project_type:mod"]]`

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
  async listVersions(idOrSlug: string, minecraftVersion?: string): Promise<ModrinthVersion[]> {
    const response = await getModrinthApi(`v2/project/${idOrSlug}/version?loaders=["fabric"]${orEmptyString(minecraftVersion, v => `&game_versions=["${v}"]`)}`)

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
