import { Command } from "commander"
import { output } from "../utils/output.js"
import dedent from "dedent"
import kleur from "kleur"
import { default as wrapAnsi } from "wrap-ansi"
import { usePack } from "../pack.js"

export const infoCommand = new Command("info")
  .description("Print information about the pack.")
  .action(async () => {
    const pack = await usePack()
    const { meta } = pack.manifest

    output.println(dedent`
      ${kleur.bold(meta.name)} (${meta.version})
      ${meta.description === undefined ? "" : wrapAnsi(meta.description, process.stdout.columns) + "\n"}\
      
      Authors: ${kleur.yellow(meta.authors.join(", "))}
      License: ${kleur.yellow(meta.license.toUpperCase())}
      Mods: ${kleur.yellow(pack.metaFiles.filter(metaFile => metaFile.isMod).length.toString())}
      
      Minecraft version: ${kleur.yellow(pack.manifest.versions.minecraft)}
    `)
  })
