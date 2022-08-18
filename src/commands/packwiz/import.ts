import { Command } from "commander"
import kleur from "kleur"
import { envPaths } from "../../utils/path.js"
import fs from "fs-extra"
import { output } from "../../utils/output.js"
import * as toml from "toml"

export const importCommand = new Command("import")
  .argument("<path>")
  .description("Import a packwiz pack.")
  .addHelpText("after", kleur.red("Please create a backup of the pack before using this command."))
  .action(async path => {
    const inputDirectoryPath = envPaths.cwd.resolveAny(path)
    const packTomlPath = inputDirectoryPath.resolve("pack.toml")

    if (!await fs.pathExists(packTomlPath.toString()))
      output.failAndExit(`${kleur.yellow(packTomlPath.toString())} does not exist.`)

    const packTomlContent = toml.parse(await fs.readFile(packTomlPath.toString(), "utf-8"))

    // TODO
  })
