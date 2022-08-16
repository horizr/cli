import { IterableElement } from "type-fest"
import { sortBy } from "lodash-es"
import { Mod, Pack, usePack } from "../pack.js"
import { ModFile, ModFileData, ModFileModrinthSource } from "../files.js"
import { pathExists } from "fs-extra"
import { nanoid } from "nanoid/non-secure"
import { output } from "../output.js"
import kleur from "kleur"
import { ModrinthMod, ModrinthVersion, ModrinthVersionFile } from "./api.js"
import { releaseChannelOrder } from "../shared.js"

export const dependencyToRelatedVersionType: Record<string, IterableElement<ModrinthVersion["relations"]>["type"]> = {
  required: "hard_dependency",
  optional: "soft_dependency",
  embedded: "embedded_dependency",
  incompatible: "incompatible"
}

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
    hashes: {
      sha1: modrinthVersionFile.hashes.sha1,
      sha512: modrinthVersionFile.hashes.sha512
    },
    downloadUrl: modrinthVersionFile.url,
    name: modrinthVersionFile.fileName,
    size: modrinthVersionFile.sizeInBytes,
  }
}

export async function addModrinthMod(modrinthMod: ModrinthMod, modrinthVersion: ModrinthVersion) {
  const pack = await usePack()
  let id = modrinthMod.slug

  if (await pathExists(pack.rootDirectoryPath.resolve("mods", `${id}.json`).toString())) {
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
