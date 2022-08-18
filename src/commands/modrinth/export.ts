import { Command } from "commander"
import { usePack } from "../../pack.js"
import { output } from "../../utils/output.js"
import fs from "fs-extra"
import { generateOutputDirectory } from "../../modrinth/exporting.js"
import kleur from "kleur"
import { zipDirectory } from "../../utils/zip.js"

const EXPORT_OUTPUT_DIRECTORY_NAME = "modrinth"

export const exportCommand = new Command("export")
  .option("-s, --no-generate", "Skip regenerating the output directory.")
  .option("-z, --no-zip", "Skip creating a zipped .mrpack file.")
  .option("-c, --clean", "Remove the output directory afterwards.")
  .action(async options => {
    const pack = await usePack()
    const outputDirectoryPath = pack.paths.exports.resolve(EXPORT_OUTPUT_DIRECTORY_NAME)

    const loader = output.startLoading("Exporting")

    if (options.generate) {
      await output.withLoading(generateOutputDirectory(outputDirectoryPath), "Generating the output directory")
      output.println(kleur.green(`Generated Modrinth pack directory.`))
    }

    if (options.zip) {
      const fileName = `${pack.manifest.slug}-${pack.manifest.meta.version}.mrpack`
      if (!(await fs.pathExists(outputDirectoryPath.toString())))
        output.failAndExit(`The ${kleur.yellow(EXPORT_OUTPUT_DIRECTORY_NAME)} export directory does not exist.\nRun the command without ${kleur.yellow("--no-generate")} to create it.`)

      await output.withLoading(zipDirectory(outputDirectoryPath, pack.paths.exports.resolve(fileName)), `Creating ${kleur.yellow(".mrpack")} file`)
      output.println(kleur.green(`Created ${kleur.yellow(fileName)}`))
    }

    if (options.clean) {
      await fs.remove(outputDirectoryPath.toString())
      output.println(kleur.green(`Removed the ${kleur.yellow(EXPORT_OUTPUT_DIRECTORY_NAME)} directory.`))
    }

    loader.stop()
  })
