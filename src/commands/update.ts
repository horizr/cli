import { Command } from "commander"
import { output } from "../utils/output.js"
import kleur from "kleur"
import dedent from "dedent"
import figures from "figures"
import { ReleaseChannel, Update, usePack } from "../pack.js"
import { filterNulls, mapNotNull } from "../utils/collections.js"
import pLimit from "p-limit"
import { gtzIntegerOption } from "../utils/options.js"
import enquirer from "enquirer"

export const updateCommand = new Command("update")
  .argument("[path]")
  .description("Check for updates of all meta files or apply a specific update.")
  .option("-y, --yes", "Skip confirmations")
  .option("-a, --alpha", "Allow alpha versions")
  .option("-b, --beta", "Allow beta versions")
  .option("-c, --concurrency", "Number of concurrent checks", gtzIntegerOption, 5)
  .action(async (pathString, options) => {
    const pack = await usePack()
    const allowedReleaseChannels: ReleaseChannel[] = ["release"]
    if (options.alpha) allowedReleaseChannels.push("alpha")
    if (options.beta) allowedReleaseChannels.push("beta")

    if (pathString === undefined) {
      const limit = pLimit(options.concurrency)
      const updateFetches = mapNotNull(pack.metaFiles, metaFile => {
        const { fetchUpdates } = metaFile
        if (fetchUpdates === null) return null
        else return limit(async () => {
          const updates = await fetchUpdates(allowedReleaseChannels)
          if (updates.length === 0) return null
          else return updates[0]
        })
      })

      const updates = filterNulls(
        await output.withLoading(
          Promise.all(updateFetches),
          `Fetching updates for ${kleur.yellow(updateFetches.length)} meta files`
        )
      )

      if (updates.length === 0) output.println(kleur.green("Everything up-to-date."))
      else {
        const getChange = (update: Update) => `${kleur.red(update.of.content.version.name)} ${figures.arrowRight} ${kleur.green(update.versionString)}`

        output.println(dedent`
          ${kleur.underline("Available updates")}
          
          ${updates.map(update => `- ${update.of.getDisplayString()} ${getChange(update)}`).join("\n")}
        `)
      }
    } else {
      const metaFile = pack.getMetaFileFromInput(pathString)
      if (metaFile.fetchUpdates === null) return output.failAndExit(`${kleur.yellow(metaFile.relativePath.toString())} is not updatable.`)

      const updates = await metaFile.fetchUpdates(allowedReleaseChannels)
      if (updates.length === 0) output.println(kleur.green("No updates available."))
      else {
        output.println(kleur.bold("Changelogs") + "\n")

        for (let update of updates) {
          output.println(kleur.underline(update.versionString))
          output.printlnWrapping((update.changelog ?? kleur.gray("not provided")) + "\n")
        }

        const confirmed = options.yes || (await enquirer.prompt({
          type: "confirm",
          name: "confirmed",
          message: "Apply the update?"
        }) as any).confirmed

        const update = updates[0]

        if (confirmed) {
          await output.withLoading(update.apply(), "Updating")
          output.println(kleur.green(`Successfully updated ${metaFile.getDisplayString()} to ${kleur.yellow(update.versionString)}.`))
        }
      }
    }
  })
