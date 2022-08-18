import { Command } from "commander"
import kleur from "kleur"
import { Side, usePack } from "../../pack.js"
import { output } from "../../utils/output.js"
import fs from "fs-extra"
import { IndexedFile, PACKWIZ_EXPORT_DIRECTORY_NAME, writeAndIndexMetaFile, writeAndIndexStaticSourceFile, writeIndexAndPackManifest } from "../../packwiz/exporting.js"

export const exportCommand = new Command("export")
  .description("Export a packwiz pack.")
  .option("-s, --server", "Use server overrides instead of client overrides. Only applies to static files.")
  .action(async (path, options) => {
    const pack = await usePack()
    const side: Side = options.server ? "server" : "client"
    const loader = output.startLoading("Exporting")

    const outputDirectoryPath = pack.paths.exports.resolve(PACKWIZ_EXPORT_DIRECTORY_NAME)
    await fs.remove(outputDirectoryPath.toString())

    const indexedFiles: IndexedFile[] = []

    let i = 0
    for (const metaFile of pack.metaFiles) {
      i++
      if (!metaFile.content.enabled) continue

      await output.withLoading(
        writeAndIndexMetaFile(indexedFiles, outputDirectoryPath, metaFile),
        `Exporting ${kleur.yellow(metaFile.getDisplayString())} (${i}/${pack.metaFiles.length})`
      )
    }

    i = 0
    for (const staticSourceFile of pack.staticSourceFiles) {
      i++
      if (staticSourceFile.side !== "universal" && staticSourceFile.side !== side) continue

      await output.withLoading(
        writeAndIndexStaticSourceFile(indexedFiles, outputDirectoryPath, staticSourceFile),
        `Exporting ${kleur.yellow(staticSourceFile.relativePath.toString())} (${i}/${pack.metaFiles.length})`
      )
    }

    loader.setText(`Creating ${kleur.yellow("index.toml")} and ${kleur.yellow("pack.toml")}`)
    await writeIndexAndPackManifest(indexedFiles, outputDirectoryPath)
    loader.stop()

    output.println(kleur.green("Generated packwiz pack"))
  })
