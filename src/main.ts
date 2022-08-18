import { Command } from "commander"
import fs from "fs-extra"
import { AbsolutePath } from "./utils/path.js"
import { output } from "./utils/output.js"
import kleur from "kleur"
import loudRejection from "loud-rejection"
import { clearGotCache } from "./utils/http.js"
import { initCommand } from "./commands/init.js"
import { infoCommand } from "./commands/info.js"
import { updateCommand } from "./commands/update.js"
import { packwizCommand } from "./commands/packwiz/index.js"
import { modrinthCommand } from "./commands/modrinth/index.js"
import { exportJsonSchemasCommand } from "./commands/exportJsonSchemas.js"

const program = new Command("horizr")
  .version(
    (await fs.readJson(AbsolutePath.create(import.meta.url.slice(5)).parent().resolve("../package.json").toString())).version,
    "-v, --version"
  )
  .option("--clear-cache", "Clear the HTTP cache before doing the operation.")
  .on("option:clear-cache", () => {
    clearGotCache()
    output.println(kleur.green("Cache was cleared.\n"))
  })
  .addCommand(modrinthCommand)
  .addCommand(packwizCommand)
  .addCommand(exportJsonSchemasCommand, { hidden: true })
  .addCommand(infoCommand)
  .addCommand(initCommand)
  .addCommand(updateCommand)

loudRejection(stack => {
  output.failAndExit(stack)
})

await program.parseAsync(process.argv)
