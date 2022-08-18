import { Command } from "commander"
import { sideOption } from "../../utils/options.js"
import {
  findMetaFileForModrinthMod,
  getMetaFileContentVersionForModrinth,
  getSideOfModrinthMod,
  isModrinthVersionCompatible, resolveFullRelation,
  resolveModrinthCode,
  sortModrinthVersionsByPreference
} from "../../modrinth/index.js"
import { output } from "../../utils/output.js"
import { modrinthApi } from "../../modrinth/api.js"
import { Side, usePack } from "../../pack.js"
import kleur from "kleur"
import { META_FILE_EXTENSION, metaFileContentSchema, writeJsonFile } from "../../files.js"
import fs from "fs-extra"
import enquirer from "enquirer"
import { orEmptyString } from "../../utils/strings.js"

export const activateCommand = new Command("activate")
  .argument("<code>")
  .alias("a")
  .option("-s, --side <side>", "The side of the mod", sideOption, null)
  .option("-y, --yes", "Skip confirmations.")
  .action(async (code, options) => {
    const pack = await usePack()
    const resolvedCode = await output.withLoading(resolveModrinthCode(code), "Resolving code")
    const modrinthMod = resolvedCode.modrinthMod
    let modrinthVersion = resolvedCode.modrinthVersion

    const existingMetaFile = findMetaFileForModrinthMod(pack.metaFiles, modrinthMod.id)
    if (existingMetaFile !== null) {
      output.println(`The mod is already active: ${kleur.yellow(existingMetaFile.relativePath.toString())} ${kleur.blue(existingMetaFile.content.version.name)}`)

      const confirmed = options.yes || (await enquirer.prompt({
        type: "confirm",
        name: "confirmed",
        message: "Do you want to continue?",
        initial: false
      }) as any).confirmed

      if (!confirmed) process.exit()
    }

    let side: Side
    const specifiedSide = getSideOfModrinthMod(modrinthMod)
    const sideOverride = options.side

    if (sideOverride === null) side = specifiedSide
    else {
      if (specifiedSide !== "universal" && specifiedSide !== sideOverride) return output.failAndExit(`Mod is incompatible with specified side: ${kleur.yellow(sideOverride)}`)
      else side = sideOverride
    }

    if (modrinthVersion === null) {
      const versions = await output.withLoading(modrinthApi.listVersions(modrinthMod.id, pack.manifest.versions.minecraft), "Fetching versions")
      if (versions.length === 0) return output.failAndExit("No compatible version available.")

      const sortedVersions = sortModrinthVersionsByPreference(versions)
      modrinthVersion = sortedVersions[0]
    } else {
      if (!isModrinthVersionCompatible(modrinthVersion, pack)) return output.failAndExit("This version is not compatible with the pack.")
    }

    const absolutePath = pack.paths.source.resolve(side, "mods", `${modrinthMod.slug}.${META_FILE_EXTENSION}`)
    const relativePath = pack.paths.source.relativeTo(absolutePath)

    await fs.mkdirp(absolutePath.parent().toString())
    await writeJsonFile(absolutePath, metaFileContentSchema, {
      enabled: true,
      version: getMetaFileContentVersionForModrinth(modrinthVersion),
      source: {
        type: "modrinth",
        versionId: modrinthVersion.id,
        modId: modrinthVersion.projectId,
        ignoreUpdates: false
      }
    })

    await pack.registerCreatedSourceFile(relativePath)
    output.println(kleur.green(`Successfully wrote ${kleur.yellow(relativePath.toString())}`))

    const loader = output.startLoading("Checking dependencies")

    for (const relation of modrinthVersion.relations) {
      if (relation.type === "hard_dependency") {
        const { modrinthMod, modrinthVersion } = await resolveFullRelation(relation)

        const metaFile = await findMetaFileForModrinthMod(pack.metaFiles, modrinthMod.id)
        if (metaFile === null) {
          const versionString = orEmptyString(modrinthVersion, v => ` ${kleur.blue(v.versionString)}`)
          const idString = kleur.gray(modrinthMod.slug + orEmptyString(modrinthVersion, v => `@${v.versionString}`))
          output.warn(`Unmet dependency: ${kleur.yellow(modrinthMod.title)}${versionString} ${idString}`)
        }
      }
    }

    loader.stop()
  })
