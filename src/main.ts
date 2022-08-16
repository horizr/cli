import { Command } from "commander"
import kleur from "kleur"
import { usePack } from "./pack.js"
import loudRejection from "loud-rejection"
import { modrinthCommand } from "./commands/modrinth.js"
import { packwizCommand } from "./commands/packwiz.js"
import dedent from "dedent"
import { default as wrapAnsi } from "wrap-ansi"
import { removeModFile } from "./files.js"
import { output } from "./output.js"
import figures from "figures"
import { releaseChannelOrder } from "./shared.js"

const program = new Command("horizr")

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

      Loader: ${kleur.yellow(`${pack.horizrFile.loader} v${pack.horizrFile.versions.loader}`)}
      Minecraft version: ${kleur.yellow(pack.horizrFile.versions.minecraft)}
    `)
  })

program.command("remove <code>")
  .description("Remove the mod from the pack.")
  .action(async code => {
    const pack = await usePack()
    const mod = pack.findModByCodeOrFail(code)

    await removeModFile(pack.rootDirectoryPath, mod.id)

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
      const loader = output.startLoading("Checking for an update")
      const mod = pack.findModByCodeOrFail(code)
      const update = await mod.checkForUpdate(allowedReleaseChannels)

      if (update === null) {
        loader.stop()
        output.println(kleur.green("No update available."))
      } else {
        loader.setText("Updating")
        await update.apply()
        loader.stop()
        output.println(kleur.green(`Successfully updated ${kleur.yellow(update.mod.modFile.name)} to ${kleur.yellow(update.availableVersion)}.`))
      }
    }
  })

loudRejection()

program
  .addCommand(packwizCommand)
  .addCommand(modrinthCommand)
  .addHelpText("afterAll", "\n" + dedent`
    ${kleur.blue("code")} can be one of the following:
    - The name of a file in the ${kleur.yellow("mods")} directory, optionally without the ${kleur.yellow(".json")} extension
    - The ID of a Modrinth Project, prefixed with ${kleur.yellow("mr:")}
    - The ID of a Modrinth Version, prefixed with ${kleur.yellow("mrv:")}
  `)
  .parse(process.argv)
