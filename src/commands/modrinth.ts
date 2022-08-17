import { Command } from "commander"
import { take } from "lodash-es"
import { usePack } from "../pack.js"
import kleur from "kleur"
import { optionParsePositiveInteger, truncateWithEllipsis, zipDirectory } from "../utils.js"
import { default as wrapAnsi } from "wrap-ansi"
import figures from "figures"
import {
  modrinthApi,
  ModrinthMod,
  ModrinthVersion,
  ModrinthVersionRelation,
} from "../modrinth/api.js"
import dedent from "dedent"
import ago from "s-ago"
import semver from "semver"
import { output } from "../output.js"
import fs from "fs-extra"
import { addModrinthMod, findModForModrinthMod, getModFileDataForModrinthVersion, isModrinthVersionCompatible, sortModrinthVersionsByPreference } from "../modrinth/utils.js"
import { walk } from "@root/walk"

const modrinthCommand = new Command("modrinth")
  .alias("mr")

modrinthCommand.command("search <query...>")
  .description("Search for mods.")
  .option("-l, --limit <number>", "Limit the number of results", optionParsePositiveInteger, 8)
  .option("-s, --skip <number>", "Skip results", optionParsePositiveInteger, 0)
  .action(async (query, options) => {
    const pack = await usePack()
    const loader = output.startLoading(`Searching for ${kleur.yellow(query)}`)
    const { results } = await modrinthApi.searchMods(pack.horizrFile.versions.minecraft, query, options)
    loader.stop()

    output.println(
      results.map(result =>
        `${kleur.blue(result.id)} ${kleur.bold(truncateWithEllipsis(result.title, 30))} ${kleur.gray(`(↓ ${result.downloadsCount})`)}\n` +
        wrapAnsi(result.description, process.stdout.columns)
      )
        .join("\n\n")
    )
  })

const colorBySideCompatibility: Record<ModrinthMod["clientSide"], kleur.Color> = {
  optional: kleur.blue,
  required: kleur.green,
  unsupported: kleur.red
}

const modrinthModCommand = modrinthCommand.command("mod")

modrinthModCommand.command("info <id>")
  .description("Show information about the mod.")
  .action(async id => {
    const loader = output.startLoading("Fetching mod information")
    const modrinthMod = await modrinthApi.getMod(id)
    if (modrinthMod === null) return loader.failAndExit("not found")

    loader.stop()
    const existingMod = await findModForModrinthMod(modrinthMod)

    output.println(dedent`
        ${kleur.bold(modrinthMod.title)} ${kleur.gray(`(↓ ${modrinthMod.downloadsCount})`)}
        ${wrapAnsi(modrinthMod.description, process.stdout.columns)}
        
        Client       Server
        ${colorBySideCompatibility[modrinthMod.clientSide](modrinthMod.clientSide.padEnd(12, " "))} ${colorBySideCompatibility[modrinthMod.serverSide](modrinthMod.serverSide)}
        
        License: ${kleur.yellow(modrinthMod.licenseCode.toUpperCase())}
        Last update: ${kleur.yellow(ago(modrinthMod.updateDate))}\
        ${existingMod === null ? "" : kleur.green("\n\nThis mod is in the pack.")}
        
        https://modrinth.com/mod/${modrinthMod.slug}
      `)
  })

modrinthModCommand.command("versions <id>")
  .description("Show a list of compatible versions of the mod.")
  .option("-l, --limit <number>", "Limit the number of versions displayed.", optionParsePositiveInteger, 3)
  .action(async (id, options) => {
    const pack = await usePack()

    const loader = output.startLoading("Fetching mod information")
    const modrinthMod = await modrinthApi.getMod(id)
    if (modrinthMod === null) return loader.failAndExit("not found")
    else loader.stop()

    const existingMod = await findModForModrinthMod(modrinthMod)
    const modrinthVersions = await output.withLoading(modrinthApi.listVersions(id, pack.horizrFile.versions.minecraft), "Fetching versions")

    if (modrinthVersions.length === 0) {
      const message =
        `There are no versions compatible with the pack (Fabric ${kleur.yellow(pack.horizrFile.versions.fabric)}, Minecraft ${kleur.yellow(pack.horizrFile.versions.minecraft)}).`

      output.println(kleur.red(message))
    } else {
      const versions = take(sortModrinthVersionsByPreference(modrinthVersions), options.limit)
        .map(modrinthVersion => {
          const state = existingMod !== null && existingMod.modFile.source.versionId === modrinthVersion.id
            ? kleur.bgGreen().black(" active ") + "\n\n"
            : modrinthVersion.isFeatured
              ? kleur.green("featured") + "\n\n"
              : ""

          return dedent`
            ${kleur.blue(modrinthVersion.id)} ${kleur.bold(modrinthVersion.versionString)} ${kleur.gray(`(↓ ${modrinthVersion.downloadsCount})`)}
            ${state}\
            ${modrinthVersion.name !== modrinthVersion.versionString ? `Name: ${kleur.yellow(modrinthVersion.name)}\n` : ""}\
            Channel: ${kleur.yellow(modrinthVersion.releaseChannel)}
            Minecraft versions: ${kleur.yellow(modrinthVersion.supportedMinecraftVersions.join(", "))}
            
            Publication: ${kleur.yellow(ago(modrinthVersion.publicationDate))}
            
            https://modrinth.com/mod/${modrinthVersion.projectId}/version/${modrinthVersion.id}
          `
        })
        .join("\n\n")

      output.println(versions)
    }
  })

modrinthModCommand.command("activate <id>")
  .description("Activate the recommended version of the mod.")
  .alias("a")
  .option("-f, --force", "Replace a different version already active.")
  .action(async (id, options) => {
    const pack = await usePack()

    const loader = output.startLoading("Fetching mod information")
    const modrinthMod = await modrinthApi.getMod(id)
    if (modrinthMod === null) return loader.failAndExit("not found")
    else loader.stop()

    const modrinthVersions = await output.withLoading(modrinthApi.listVersions(id, pack.horizrFile.versions.minecraft), "Fetching versions")
    if (modrinthVersions.length === 0) return output.failAndExit("There is no compatible version of this mod.")

    const sortedModrinthVersions = sortModrinthVersionsByPreference(modrinthVersions)
    const modrinthVersion = sortedModrinthVersions[0]

    await handleActivate(modrinthMod, modrinthVersion, options.force)
  })

const colorByRelationType: Record<ModrinthVersionRelation["type"], kleur.Color> = {
  "embedded_dependency": kleur.green,
  "soft_dependency": kleur.magenta,
  "hard_dependency": kleur.yellow,
  "incompatible": kleur.red
}

const nullVersionStringByRelationType: Record<ModrinthVersionRelation["type"], string> = {
  "embedded_dependency": "unknown version",
  "soft_dependency": "any version",
  "hard_dependency": "any version",
  "incompatible": "all versions"
}

const versionStateStrings = {
  "active": kleur.bgGreen().black(" active "),
  "compatible": kleur.blue("compatible"),
  "incompatible": kleur.red("incompatible"),
  "newer_version": `${kleur.bgYellow().black(" older version active ")} ${figures.arrowRight} EXISTING_VERSION`,
  "older_version": `${kleur.bgYellow().black(" newer version active ")} ${figures.arrowRight} EXISTING_VERSION`,
  "different_version": `${kleur.bgYellow().black(" different version active ")} ${figures.arrowRight} EXISTING_VERSION`
}

async function getRelationsListLines(relations: ModrinthVersionRelation[]) {
  return await Promise.all(relations.map(async relation => {
    const color = colorByRelationType[relation.type]

    const relatedVersion = relation.versionId === null ? null : (await modrinthApi.getVersion(relation.versionId))
    const versionString = relatedVersion === null ? nullVersionStringByRelationType[relation.type] : relatedVersion.versionString
    const relatedMod = (await modrinthApi.getMod(relation.projectId === null ? relatedVersion!.projectId : relation.projectId))!

    return `${color(figures.circleFilled)} ${relatedMod.title}${relation.projectId ? ` (${kleur.blue(relation.projectId)})` : ""}: ` +
      `${versionString}${relation.versionId ? ` (${kleur.blue(relation.versionId)})` + " " : ""}`
  }))
}

const modrinthVersionCommand = modrinthCommand.command("version")

modrinthVersionCommand.command("info <id>")
  .description("Show information about the version.")
  .option("-c, --changelog", "Show the changelog.")
  .action(async (id, options) => {
    const pack = await usePack()
    const loader = output.startLoading("Fetching version information")

    const modrinthVersion = await modrinthApi.getVersion(id)
    if (modrinthVersion === null) return loader.failAndExit("not found")

    loader.setText("Fetching mod information")
    const modrinthMod = (await modrinthApi.getMod(modrinthVersion.projectId))!

    const existingMod = await findModForModrinthMod(modrinthMod)

    let state: keyof typeof versionStateStrings
    if (existingMod === null) state = isModrinthVersionCompatible(modrinthVersion, pack) ? "compatible" : "incompatible"
    else {
      if (existingMod.modFile.source.versionId === modrinthVersion.id) state = "active"
      else {
        const existingSemver = semver.parse(existingMod.modFile.file.version)
        const newSemver = semver.parse(modrinthVersion.versionString)

        if (existingSemver === null || newSemver === null) state = "different_version"
        else {
          const comparison = newSemver.compare(existingSemver)

          if (comparison === 1) state = "newer_version"
          else if (comparison === -1) state = "older_version"
          else state = "active" // this should not happen: the versionString is the same but the versionId is different
        }
      }
    }

    loader.setText("Resolving relations")

    const relationsList = modrinthVersion.relations.length !== 0 ? (await getRelationsListLines(modrinthVersion.relations)).join("\n") : kleur.gray("none")

    const relationsColorKey = `${colorByRelationType.hard_dependency("hard dependency")}, ${colorByRelationType.soft_dependency("soft dependency")}, ` +
      `${colorByRelationType.embedded_dependency("embedded")}, ${colorByRelationType.incompatible("incompatible")}`

    loader.stop()

    output.println(dedent`
      ${kleur.underline(modrinthMod.title)} ${kleur.yellow(`${modrinthVersion.versionString} (${modrinthVersion.releaseChannel})`)}
      ${versionStateStrings[state].replace("EXISTING_VERSION", existingMod?.modFile?.file.version ?? "ERROR")}
      
      Version name: ${kleur.yellow(modrinthVersion.name)} ${kleur.gray(ago(modrinthVersion.publicationDate))}
      Minecraft versions: ${modrinthVersion.supportedMinecraftVersions.map(version => version === pack.horizrFile.versions.minecraft ? kleur.green(version) : kleur.red(version)).join(", ")}
      Loaders: ${modrinthVersion.supportedLoaders.map(loader => loader === "fabric" ? kleur.green(loader) : kleur.red(loader)).join(", ")}
      
      Related mods: ${relationsColorKey}
      ${relationsList}
      
      https://modrinth.com/mod/${modrinthMod.slug}/version/${modrinthVersion.versionString}
    `)

    if (options.changelog) {
      output.println("")
      output.println(kleur.underline("Changelog"))
      if (modrinthVersion.changelog === null) output.println(kleur.gray("not available"))
      else output.printlnWrapping(modrinthVersion.changelog)
    }
  })

modrinthVersionCommand.command("activate <id>")
  .description("Activate the mod version.")
  .alias("a")
  .option("-f, --force", "Replace a different version already active.")
  .action(async (id, options) => {
    const pack = await usePack()
    const loader = output.startLoading("Fetching version information")

    const modrinthVersion = await modrinthApi.getVersion(id)
    if (modrinthVersion === null) return loader.failAndExit("not found")

    loader.setText("Fetching mod information")
    const modrinthMod = (await modrinthApi.getMod(modrinthVersion.projectId))!
    loader.stop()

    if (!isModrinthVersionCompatible(modrinthVersion, pack)) return output.failAndExit("This version is not compatible with the pack.")

    await handleActivate(modrinthMod, modrinthVersion, options.force)
  })

modrinthCommand.command("export")
  .description("Export a Modrinth pack.")
  .option("-s, --no-generate", "Skip regenerating the output directory.")
  .option("-z, --no-zip", "Skip creating a zipped .mrpack file.")
  .option("-c, --clear", "Remove the output directory afterwards.")
  .action(async options => {
    const pack = await usePack()

    const outputDirectory = pack.paths.generated.resolve("modrinth-pack")

    if (options.generate) {
      const loader = output.startLoading("Generating")
      await pack.validateOverridesDirectories()
      await fs.remove(outputDirectory.toString())
      await fs.mkdirp(outputDirectory.toString())

      await fs.writeJson(outputDirectory.resolve("modrinth.index.json").toString(), {
        formatVersion: 1,
        game: "minecraft",
        versionId: pack.horizrFile.meta.version,
        name: pack.horizrFile.meta.name,
        summary: pack.horizrFile.meta.description,
        dependencies: {
          minecraft: pack.horizrFile.versions.minecraft,
          "fabric-loader": pack.horizrFile.versions.fabric
        },
        files: pack.mods.map(mod => ({
          path: `mods/${mod.modFile.file.name}`,
          hashes: {
            sha1: mod.modFile.file.hashes.sha1,
            sha512: mod.modFile.file.hashes.sha512
          },
          env: {
            client: mod.modFile.side === "client" || mod.modFile.side === "client-server" ? "required" : "unsupported",
            server: mod.modFile.side === "server" || mod.modFile.side === "client-server" ? "required" : "unsupported"
          },
          downloads: [
            mod.modFile.file.downloadUrl
          ],
          fileSize: mod.modFile.file.size
        }))
      }, { spaces: 2 })

      if (await fs.pathExists(pack.paths.overrides["client-server"].toString())) await output.withLoading(
        fs.copy(pack.paths.overrides["client-server"].toString(), outputDirectory.resolve("overrides").toString(), { recursive: true }),
        "Copying client-server overrides"
      )

      if (await fs.pathExists(pack.paths.overrides["client"].toString())) {
        await output.withLoading(
          fs.copy(pack.paths.overrides["client"].toString(), outputDirectory.resolve("client-overrides").toString(), { recursive: true }),
          "Copying client overrides"
        )

        // Workaround for https://github.com/PolyMC/PolyMC/issues/1060
        await walk(pack.paths.overrides["client"].toString(), async (error, path, dirent) => {
          if (error) return
          if (dirent.isDirectory()) {
            const relativePath = pack.paths.overrides["client"].relative(path)
            await fs.mkdirp(outputDirectory.resolve("overrides", relativePath).toString())
          }

          return true
        })
      }

      if (await fs.pathExists(pack.paths.overrides["server"].toString())) await output.withLoading(
        fs.copy(pack.paths.overrides["server"].toString(), outputDirectory.resolve("server-overrides").toString(), { recursive: true }),
        "Copying server overrides"
      )

      output.println(kleur.green(`Generated Modrinth pack`))
      loader.stop()
    }

    if (options.zip) {
      if (!(await fs.pathExists(outputDirectory.toString())))
        output.failAndExit(`The ${kleur.yellow("modrinth-pack")} directory does not exist.\nRun the command without ${kleur.yellow("--no-generate")} to create it.`)

      await output.withLoading(zipDirectory(outputDirectory, pack.paths.generated.resolve("pack.mrpack")), `Creating ${kleur.yellow(".mrpack")} file`)
      output.println(kleur.green(`Created ${kleur.yellow("pack.mrpack")}`))
    }

    if (options.clear) {
      await fs.remove(outputDirectory.toString())
      output.println(kleur.green(`Removed the ${kleur.yellow("modrinth-pack")} directory`))
    }
  })

async function handleActivate(modrinthMod: ModrinthMod, modrinthVersion: ModrinthVersion, force: boolean) {
  const existingMod = await findModForModrinthMod(modrinthMod)

  if (existingMod === null) {
    await addModrinthMod(modrinthMod, modrinthVersion)
    output.println(`${modrinthMod.title} (${modrinthVersion.versionString}) ${kleur.green("was successfully activated.")}\n`)

    await handleDependencies(modrinthVersion.relations)
  } else {
    const oldVersion = existingMod.modFile.file.version
    if (existingMod.modFile.source.versionId === modrinthVersion.id) {
      output.println(kleur.green("This version is already installed."))
    } else if (force) {
      existingMod.modFile.file = getModFileDataForModrinthVersion(modrinthMod, modrinthVersion)
      existingMod.modFile.source.versionId = modrinthVersion.id
      await existingMod.saveModFile()
      output.println(`${kleur.green("Successfully replaced version")} ${oldVersion} ${kleur.green("of")} ${modrinthMod.title} ${kleur.green("with")} ${modrinthVersion.versionString}${kleur.green(".")}`)

      await handleDependencies(modrinthVersion.relations)
    } else {
      output.failAndExit(`There is already a different version of this mod installed.\nRun this command again with ${kleur.yellow("-f")} to change the version.`)
    }
  }
}

async function handleDependencies(relations: ModrinthVersionRelation[]) {
  const loader = output.startLoading("Fetching dependency information")
  const lines = await getRelationsListLines(relations.filter(relation => relation.type === "hard_dependency" || relation.type === "soft_dependency"))

  if (lines.length !== 0) {
    output.println(dedent`
      \n${kleur.underline("Dependencies")} ${colorByRelationType.hard_dependency("hard")}, ${colorByRelationType.soft_dependency("soft")}
      
      ${lines.join("\n")}
    `)
  }

  loader.stop()
}

export { modrinthCommand }
