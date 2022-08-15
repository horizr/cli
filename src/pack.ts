import { findPackDirectoryPath, HorizrFile, ModFile, ModFileModrinthSource, readHorizrFile, readModFile, readModIds, writeModFile } from "./files.js"
import { resolve } from "path"
import { output } from "./output.js"
import pLimit from "p-limit"
import kleur from "kleur"
import { getModFileDataForModrinthVersion, modrinthApi, ReleaseChannel, sortModrinthVersionsByPreference } from "./modrinth.js"
import semver from "semver"

export type Loader = "fabric" | "quilt"

export interface Update {
  mod: Mod
  activeVersion: string
  availableVersion: string
  apply(): Promise<void>
}

export interface Pack {
  path: string
  horizrFile: HorizrFile
  mods: Mod[]

  addMod(id: string, file: ModFile): Promise<void>

  findModByCode(code: string): Mod | null

  findModByCodeOrFail(code: string): Mod

  checkForUpdates(allowedReleaseChannels: ReleaseChannel[]): Promise<Update[]>

  resolvePath(...segments: string[]): string
}

export interface Mod {
  id: string

  modFile: ModFile
  saveModFile(): Promise<void>

  checkForUpdate(allowedReleaseChannels: ReleaseChannel[]): Promise<Update | null>
}

let pack: Pack

export async function usePack(): Promise<Pack> {
  if (pack === undefined) {
    const path = await findPackDirectoryPath()

    pack = {
      path,
      horizrFile: await readHorizrFile(path),
      mods: await Promise.all((await readModIds(path)).map(async id => {
        const mod: Mod = {
          id,
          modFile: (await readModFile(path, id))!,
          async saveModFile() {
            await writeModFile(path, id, this.modFile)
          },
          async checkForUpdate(allowedReleaseChannels: ReleaseChannel[]): Promise<Update | null> {
            if (mod.modFile.ignoreUpdates) return null

            if (mod.modFile.source.type === "modrinth") {
              const activeVersionString = mod.modFile.file.version
              const activeSemver = semver.parse(activeVersionString)
              if (activeSemver === null)
                output.warn(`${kleur.yellow(mod.modFile.name)} has no valid semantic version: ${kleur.yellow(mod.modFile.file.version)}. The publication date will instead be used.`)

              const versions = await modrinthApi.listVersions(mod.modFile.source.modId, pack.horizrFile.loader, pack.horizrFile.versions.minecraft)
              const allowedVersions = versions.filter(version => allowedReleaseChannels.includes(version.releaseChannel))

              const newerVersions = activeSemver === null ? allowedVersions : allowedVersions.filter(version => {
                const thisSemver = semver.parse(version.versionString)
                if (thisSemver === null) return false

                return thisSemver.compare(activeSemver) === 1
              })

              if (newerVersions.length === 0) return null

              const sortedNewerVersions = sortModrinthVersionsByPreference(newerVersions)
              const newestVersion = sortedNewerVersions[0]

              if (activeSemver === null ? activeVersionString === newestVersion.versionString : semver.eq(activeSemver, newestVersion.versionString)) return null

              return {
                mod,
                activeVersion: activeVersionString,
                availableVersion: newestVersion.versionString,
                async apply() {
                  const modrinthMod = (await modrinthApi.getMod(newestVersion.projectId))!

                  mod.modFile.file = getModFileDataForModrinthVersion(modrinthMod, newestVersion)
                  ;(mod.modFile.source as ModFileModrinthSource).versionId = newestVersion.id

                  await mod.saveModFile()
                }
              }
            } else {
              output.warn(`${kleur.yellow(mod.modFile.name)} has no source information attached.`)
            }

            return null
          }
        }

        return mod
      })),
      async addMod(id: string, file: ModFile) {
        await writeModFile(path, id, file)
      },
      findModByCode(code: string): Mod | null {
        if (code.startsWith("mrv:")) {
          return this.mods.find(mod => mod.modFile.source.type === "modrinth" && mod.modFile.source.versionId === code.slice(4)) ?? null
        } else if (code.startsWith("mr:")) {
          return this.mods.find(mod => mod.modFile.source.type === "modrinth" && mod.modFile.source.modId === code.slice(3)) ?? null
        } else if (code.endsWith(".json")) {
          return this.mods.find(mod => mod.id === code.slice(0, -5)) ?? null
        } else {
          return this.mods.find(mod => mod.id === code) ?? null
        }
      },
      findModByCodeOrFail(code: string): Mod {
        const mod = this.findModByCode(code)
        if (mod === null) return output.failAndExit("The mod could not be found.")
        return mod
      },
      async checkForUpdates(allowedReleaseChannels: ReleaseChannel[]): Promise<Update[]> {
        const limit = pLimit(5)

        const loader = output.startLoading(`Checking for updates (0/${this.mods.length})`)
        let finishedCount = 0
        const updates: Array<Update | null> = await Promise.all(this.mods.map(mod => limit(async () => {
          const update = await mod.checkForUpdate(allowedReleaseChannels)
          finishedCount++
          loader.setText(`Checking for updates (${finishedCount}/${this.mods.length})`)
          return update
        })))

        loader.stop()
        return updates.filter(info => info !== null) as Update[]
      },
      resolvePath(...segments): string {
        return resolve(path, ...segments)
      }
    }
  }

  return pack
}
