import { Command } from "commander"
import { usePack } from "../../pack.js"
import { output } from "../../utils/output.js"
import kleur from "kleur"
import open from "open"

export const openCommand = new Command("open")
  .argument("<path>")
  .action(async pathString => {
    const pack = await usePack()
    const metaFile = pack.getMetaFileFromInput(pathString)

    if (metaFile.content.source?.type === "modrinth") {
      const { modId } = metaFile.content.source
      const url = `https://modrinth.com/mod/${encodeURIComponent(modId)}`

      try {
        await open(url, { wait: false })
        output.printlnWrapping(kleur.green(`Opened ${kleur.yellow(url)} in your default browser.`))
      } catch (e: unknown) {
        output.fail(`Could not open ${kleur.yellow(url)} in a browser.`)
      }
    } else output.failAndExit(`${kleur.yellow(metaFile.relativePath.toString())} is not a Modrinth mod.`)
  })
