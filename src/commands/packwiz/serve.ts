import { Command } from "commander"
import kleur from "kleur"
import fs from "fs-extra"
import { output } from "../../utils/output.js"
import { positiveIntegerOption } from "../../utils/options.js"
import { usePack } from "../../pack.js"
import { PACKWIZ_EXPORT_DIRECTORY_NAME } from "../../packwiz/exporting.js"
import { httpServeDirectoryWithMessage } from "../../utils/http.js"

export const serveCommand = new Command("serve")
  .description("Start an HTTP server in the packwiz directory.")
  .option("-p, --port <port>", "The port of the HTTP server.", positiveIntegerOption, 8000)
  .option("-e, --expose", "Expose the HTTP server on all interfaces.")
  .action(async options => {
    const pack = await usePack()
    const directoryPath = pack.paths.exports.resolve(PACKWIZ_EXPORT_DIRECTORY_NAME)

    if (!(await fs.pathExists(directoryPath.toString())))
      output.failAndExit(`The ${kleur.yellow(pack.paths.root.relativeTo(directoryPath).toString())} directory does not exist. ` +
        `Generate it by running ${kleur.yellow("horizr packwiz export")}.`
      )

    await httpServeDirectoryWithMessage(directoryPath, options.port, options.expose)
  })
