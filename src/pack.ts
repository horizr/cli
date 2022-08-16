import { findPackDirectoryPath, getOverrideDirents, HorizrFile, ModFile, ModFileModrinthSource, readHorizrFile, readModFile, readModIds, writeModFile } from "./files.js"
import { output } from "./output.js"
import pLimit from "p-limit"
import kleur from "kleur"
import { modrinthApi } from "./modrinth/api.js"
import semver from "semver"
import { Path } from "./path.js"
import { ReleaseChannel, Side, sides } from "./shared.js"
import { getModFileDataForModrinthVersion, sortModrinthVersionsByPreference } from "./modrinth/utils.js"

export interface Update {
  mod: Mod
  activeVersion: string
  availableVersion: string
  changelog: string | null
  apply(): Promise<void>
}

export interface Pack {
  paths: {
    root: Path,
    mods: Path,
    generated: Path,
    overrides: Record<Side, Path>
  },
  horizrFile: HorizrFile
  mods: Mod[]

  addMod(id: string, file: ModFile): Promise<void>
  findModByCode(code: string): Mod | null
  findModByCodeOrFail(code: string): Mod
  validateOverridesDirectories(): Promise<void>

  checkForUpdates(allowedReleaseChannels: ReleaseChannel[]): Promise<Update[]>
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
    const rootDirectoryPath = await findPackDirectoryPath()
    const overridesDirectoryPath = rootDirectoryPath.resolve("overrides")

    pack = {
      paths: {
        root: rootDirectoryPath,
        generated: rootDirectoryPath.resolve("generated"),
        mods: rootDirectoryPath.resolve("mods"),
        overrides: {
          client: overridesDirectoryPath.resolve("client"),
          server: overridesDirectoryPath.resolve("server"),
          "client-server": overridesDirectoryPath.resolve("client-server")
        }
      },
      horizrFile: await readHorizrFile(rootDirectoryPath),
      mods: await Promise.all((await readModIds(rootDirectoryPath)).map(async id => {
        const mod: Mod = {
          id,
          modFile: (await readModFile(rootDirectoryPath, id))!,
          async saveModFile() {
            await writeModFile(rootDirectoryPath, id, this.modFile)
          },
          async checkForUpdate(allowedReleaseChannels: ReleaseChannel[]): Promise<Update | null> {
            if (mod.modFile.ignoreUpdates) return null

            if (mod.modFile.source.type === "modrinth") {
              const activeVersionString = mod.modFile.file.version
              const activeSemver = semver.parse(activeVersionString)
              if (activeSemver === null) output.warn(
                `${kleur.yellow(mod.modFile.name)} has no valid semantic version: ${kleur.yellow(mod.modFile.file.version)}. ` +
                  `The publication date will instead be used.`
              )

              const versions = await modrinthApi.listVersions(mod.modFile.source.modId, pack.horizrFile.versions.minecraft)
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
                changelog: newestVersion.changelog,
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
        await writeModFile(rootDirectoryPath, id, file)
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
      async validateOverridesDirectories() {
        const dirents = await getOverrideDirents(overridesDirectoryPath)

        const notDirectories = dirents.filter(dirent => !dirent.isDirectory())
        if (notDirectories.length !== 0)
          output.failAndExit(
            `The ${kleur.yellow("overrides")} directory contains files that are not directories:\n${notDirectories.slice(0, 5).map(e => `- ${e.name}`).join("\n")}` +
            (notDirectories.length > 5 ? `\n${kleur.gray(`and ${notDirectories.length - 5} more`)}` : "") +
            `\n\nAll files must reside in one of these sub-directories: ${sides.map(kleur.yellow).join(", ")}`
          )

        if (dirents.some(dirent => !(sides as string[]).includes(dirent.name)))
          output.failAndExit(`The ${kleur.yellow("overrides")} directory may only contain the following sub-directories:\n${sides.map(side => `- ${side}`).join("\n")}`)
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
      }
    }
  }

  return pack
}
