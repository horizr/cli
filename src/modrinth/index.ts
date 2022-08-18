import { IterableElement } from "type-fest"
import { modrinthApi, ModrinthMod, ModrinthVersion, ModrinthVersionFile } from "./api.js"
import { sortBy } from "lodash-es"
import { MetaFile, Pack, releaseChannelOrder } from "../pack.js"
import { MetaFileContentVersion } from "../files.js"
import { output } from "../utils/output.js"
import kleur from "kleur"

export const dependencyToRelatedVersionType: Record<string, IterableElement<ModrinthVersion["relations"]>["type"]> = {
  required: "hard_dependency",
  optional: "soft_dependency",
  embedded: "embedded_dependency",
  incompatible: "incompatible"
}

export const sortModrinthVersionsByPreference = (versions: ModrinthVersion[]) => sortBy(versions, [v => releaseChannelOrder.indexOf(v.releaseChannel), "isFeatured", "publicationDate"]).reverse()

export const isModrinthVersionCompatible = (modrinthVersion: ModrinthVersion, pack: Pack) =>
  modrinthVersion.supportedMinecraftVersions.includes(pack.manifest.versions.minecraft) && modrinthVersion.supportedLoaders.includes("fabric")

export function getMetaFileContentVersionForModrinth(modrinthVersion: ModrinthVersion): MetaFileContentVersion {
  const modrinthVersionFile = findCorrectModVersionFile(modrinthVersion.files)

  return {
    name: modrinthVersion.versionString,
    fileName: modrinthVersionFile.fileName,
    hashes: {
      sha1: modrinthVersionFile.hashes.sha1,
      sha512: modrinthVersionFile.hashes.sha512
    },
    downloadUrl: modrinthVersionFile.url,
    size: modrinthVersionFile.sizeInBytes
  }
}

export function findCorrectModVersionFile(files: ModrinthVersionFile[]) {
  const primary = files.find(file => file.isPrimary)

  if (primary !== undefined) return primary

  // shortest file name
  return files.sort((a, b) => a.fileName.length - b.fileName.length)[0]
}

export const getSideOfModrinthMod = (modrinthMod: ModrinthMod) =>
  modrinthMod.serverSide !== "unsupported" && modrinthMod.clientSide !== "unsupported"
    ? "universal"
    : modrinthMod.clientSide !== "unsupported" ? "client" : "server"

export async function resolveModrinthCode(code: string): Promise<{ modrinthMod: ModrinthMod; modrinthVersion: ModrinthVersion | null }> {
  const resolveMod = async (slugOrId: string) => {
    const modrinthMod = await modrinthApi.getMod(slugOrId)
    if (modrinthMod === null) return output.failAndExit(`Unknown mod: ${kleur.yellow(slugOrId)}`)
    return {
      modrinthMod,
      modrinthVersion: null
    }
  }

  const resolveVersionByName = async (modrinthMod: ModrinthMod, name: string) => {
    const modrinthVersions = await modrinthApi.listVersions(modrinthMod.id)

    const modrinthVersion = modrinthVersions.find(v => v.versionString === name)
    if (modrinthVersion === undefined) return output.failAndExit(`Unknown version: ${kleur.yellow(name)}`)

    return {
      modrinthMod: (await modrinthApi.getMod(modrinthVersion.projectId))!,
      modrinthVersion
    }
  }

  const resolveVersion = async (id: string) => {
    const modrinthVersion = await modrinthApi.getVersion(id)
    if (modrinthVersion === null) return output.failAndExit(`Unknown version: ${kleur.yellow(id)}`)

    return {
      modrinthMod: (await modrinthApi.getMod(modrinthVersion.projectId))!,
      modrinthVersion
    }
  }

  const parts = code.split("@")
  if (parts.length === 2 && parts[0] === "") return resolveVersion(code.slice(1))
  if (parts.length <= 2 && !code.startsWith("https://")) {
    const value = await resolveMod(parts[0])

    if (parts.length === 2) return resolveVersionByName(value.modrinthMod, parts[1])
    else return value
  }

  try {
    const url = new URL(code)
    const pathSegments = url.pathname.slice(1).split("/")
    if (!(code.startsWith("https://modrinth.com/mod/") && (pathSegments.length === 2 || pathSegments.length === 4)))
      output.failAndExit("Only Modrinth mod and version URLs are supported.")

    const value = await resolveMod(pathSegments[1])

    if (pathSegments.length === 4) return resolveVersionByName(value.modrinthMod, pathSegments[3])
    else return value
  } catch (e: unknown) {
    // TypeError means code is not a URL
    if (!(e instanceof TypeError)) throw e
  }

  return output.failAndExit(`Invalid ${kleur.yellow("<code>")}: ${kleur.yellow(code)}`)
}

export const findMetaFileForModrinthMod = (metaFiles: MetaFile[], modrinthMod: ModrinthMod) =>
  metaFiles.find(metaFile => metaFile.content.source?.type === "modrinth" && metaFile.content.source.modId === modrinthMod.id) ?? null
