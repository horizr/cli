import { Command } from "commander"
import kleur from "kleur"
import { usePack } from "./pack.js"
import loudRejection from "loud-rejection"
import { modrinthCommand } from "./commands/modrinth.js"
import { packwizCommand } from "./commands/packwiz.js"
import dedent from "dedent"
import { default as wrapAnsi } from "wrap-ansi"
import { CURRENT_HORIZR_FILE_FORMAT_VERSION, HorizrFile, removeModFile } from "./files.js"
import { output } from "./output.js"
import figures from "figures"
import yesno from "yesno"
import { releaseChannelOrder } from "./shared.js"
import fs from "fs-extra"
import { Path } from "./path.js"
import enquirer from "enquirer"
import { clearCache } from "./utils.js"
import { fetchFabricMinecraftVersions, fetchFabricVersions } from "./fabricApi.js"

const program = new Command("horizr")
  .version(
    (await fs.readJson(Path.create(import.meta.url.slice(5)).getParent().resolve("../package.json").toString())).version,
    "-v, --version"
  )
  .option("--clear-cache", "Clear the HTTP cache before doing the operation.")
  .on("option:clear-cache", () => {
    clearCache()
    output.println(kleur.green("Cache was cleared.\n"))
  })

program.command("init <path>")
  .description("Initialize a new pack in the directory.")
  .action(async path => {
    const directoryPath = Path.create(path)
    const horizrFilePath = directoryPath.resolve("horizr.json")

    if (await fs.pathExists(horizrFilePath.toString())) output.failAndExit(`${kleur.yellow("horizr.json")} already exists in the directory.`)

    await fs.mkdirp(directoryPath.toString())
    const minecraftVersions = await output.withLoading(fetchFabricMinecraftVersions(), "Fetching Minecraft versions")

    const answers: any = await enquirer.prompt([
      {
        name: "name",
        type: "input",
        message: "Name",
        validate: answer => answer.length === 0 ? "An answer is required." : true
      },
      {
        name: "authors",
        type: "input",
        message: "Authors (comma-separated)",
        validate: answer => answer.length === 0 ? "An answer is required." : true
      },
      {
        name: "description",
        type: "text",
        message: "Description"
      },
      {
        name: "license",
        type: "text",
        message: "License (SPDX-ID)",
        validate: answer => answer.length === 0 ? "An answer is required." : true
      },
      {
        name: "minecraftVersion",
        type: "autocomplete",
        message: "Minecraft version",
        choices: minecraftVersions.map(version => ({
          name: version,
          value: version
        })),
        // @ts-expect-error
        limit: 10,
        validate: answer => minecraftVersions.includes(answer) ? true : "Please select a version from the list."
      }
    ])

    const fabricVersion = (await output.withLoading(fetchFabricVersions(answers.minecraftVersion), "Fetching latest Fabric version"))[0]

    const file: HorizrFile = {
      formatVersion: CURRENT_HORIZR_FILE_FORMAT_VERSION,
      meta: {
        name: answers.name,
        version: "1.0.0",
        description: answers.description === "" ? undefined : answers.description,
        authors: (answers.authors as string).split(", ").map(a => a.trim()),
        license: answers.license
      },
      versions: {
        minecraft: answers.minecraftVersion,
        fabric: fabricVersion
      }
    }

    await fs.writeJson(horizrFilePath.toString(), file, { spaces: 2 })
    await fs.writeFile(directoryPath.resolve(".gitignore").toString(), "/generated/")

    const relativePath = Path.create(process.cwd()).relative(directoryPath).toString()
    if (relativePath === "") output.println(kleur.green(`Successfully initialized pack.`))
    else output.println(kleur.green(`Successfully initialized pack in ${kleur.yellow(relativePath)}.`))
  })

program.command("info", { isDefault: true })
  .description("Print information about the pack.")
  .action(async () => {
    const pack = await usePack()
    const disabledModsCount = pack.mods.filter(mod => !mod.modFile.enabled).length
    const { description } = pack.horizrFile.meta

    output.println(dedent`
      ${kleur.underline(pack.horizrFile.meta.name)} ${kleur.dim(`(${pack.horizrFile.meta.version})`)}
      ${description === undefined ? "" : wrapAnsi(description, process.stdout.columns) + "\n"}\
      
      Authors: ${kleur.yellow(pack.horizrFile.meta.authors.join(", "))}
      License: ${kleur.yellow(pack.horizrFile.meta.license.toUpperCase())}
      Mods: ${kleur.yellow(pack.mods.length.toString())}${disabledModsCount === 0 ? "" : ` (${disabledModsCount} disabled)`}

      Minecraft version: ${kleur.yellow(pack.horizrFile.versions.minecraft)}
    `)
  })

program.command("remove <code>")
  .description("Remove the mod from the pack.")
  .action(async code => {
    const pack = await usePack()
    const mod = pack.findModByCodeOrFail(code)

    await removeModFile(pack.paths.root, mod.id)

    output.println(`${mod.modFile.name} ${kleur.green("was removed from the pack.")}`)
  })

program.command("update [code]")
  .description("Check for updates of all mods or update a specific mod")
  .option("-y, --yes", "Skip confirmations")
  .option("-b, --allow-beta", "Allow beta versions")
  .option("-a, --allow-alpha", "Allow alpha and beta versions")
  .action(async (code, options) => {
    const pack = await usePack()
    const allowedReleaseChannels = releaseChannelOrder.slice(releaseChannelOrder.indexOf(options.allowAlpha ? "alpha" : options.allowBeta ? "beta" : "release"))

    if (code === undefined) {
      const updates = await pack.checkForUpdates(allowedReleaseChannels)

      if (updates.length === 0) output.println(kleur.green("Everything up-to-date."))
      else {
        output.println(dedent`
          ${kleur.underline("Available updates")}
          
          ${updates.map(update => `- ${kleur.gray(update.mod.id)} ${update.mod.modFile.name}: ${kleur.red(update.activeVersion)} ${figures.arrowRight} ${kleur.green(update.availableVersion)}`).join("\n")}
        `)
      }
    } else {
      const mod = pack.findModByCodeOrFail(code)
      const update = await output.withLoading(mod.checkForUpdate(allowedReleaseChannels), "Checking for an update")

      if (update === null) {
        output.println(kleur.green("No update available."))
      } else {
        if (update.changelog === null) {
          output.println(`No changelog available for ${kleur.bold(update.availableVersion)}.`)
        } else {
          output.println(`${kleur.underline("Changelog")} for ${kleur.bold().yellow(update.availableVersion)}\n`)
          output.printlnWrapping(update.changelog)
        }

        output.println("")

        const confirmed = options.yes || await yesno({
          question: "Apply the update? [Y/n]",
          defaultValue: true,
          invalid: () => {}
        })

        if (confirmed) {
          await output.withLoading(update.apply(), "Updating")
          output.println(kleur.green(`Successfully updated ${kleur.yellow(update.mod.modFile.name)} to ${kleur.yellow(update.availableVersion)}.`))
        }
      }
    }
  })

loudRejection(stack => {
  output.failAndExit(stack)
})

await program
  .addCommand(packwizCommand)
  .addCommand(modrinthCommand)
  .addHelpText("after", "\n" + dedent`
    ${kleur.blue("code")} can be one of the following:
    - The name of a file in the ${kleur.yellow("mods")} directory, optionally without the ${kleur.yellow(".json")} extension
    - The ID of a Modrinth Project, prefixed with ${kleur.yellow("mr:")}
    - The ID of a Modrinth Version, prefixed with ${kleur.yellow("mrv:")}
  `)
  .parseAsync(process.argv)
