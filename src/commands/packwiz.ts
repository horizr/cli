import { Command } from "commander"
import { usePack } from "../pack.js"
import fs from "fs-extra"
import dedent from "dedent"
import kleur from "kleur"
import { relative } from "path"
import { getSha512HexHash } from "../utils.js"
import { output } from "../output.js"

const packwizCommand = new Command("packwiz")

interface IndexedFile {
  path: string
  sha512HashHex: string
  isMeta: boolean
}

packwizCommand.command("export")
  .description("Generates a packwiz pack in the packwiz directory")
  .action(async () => {
    const pack = await usePack()

    if (pack.horizrFile.loader !== "fabric")
      output.println(kleur.yellow(`packwiz does not yet support the ${kleur.reset(pack.horizrFile.loader)} loader. No loader will be specified.`))

    const loader = output.startLoading("Generating")

    const rootDirectoryPath = pack.resolvePath("packwiz")
    await fs.remove(rootDirectoryPath)
    await fs.mkdirp(pack.resolvePath("packwiz/mods"))

    const indexedFiles: IndexedFile[] = []
    for (const mod of pack.mods) {
      if (!mod.modFile.enabled) output.warn(`${kleur.yellow(mod.modFile.name)} is disabled and will not be included.`)
      const innerLoader = output.startLoading(`Generating ${kleur.yellow(mod.id + ".toml")} (${indexedFiles.length + 1}/${pack.mods.length})`)

      const content = dedent`
        name = ${JSON.stringify(mod.modFile.name)}
        filename = ${JSON.stringify(mod.modFile.file.name)}
        side = "${mod.modFile.side.replace("client+server", "both")}"
        
        [download]
        hash-format = "${mod.modFile.file.hashAlgorithm}"
        hash = ${JSON.stringify(mod.modFile.file.hash)}
        url = ${JSON.stringify(mod.modFile.file.downloadUrl)}
      `

      const path = pack.resolvePath("packwiz/mods", mod.id + ".toml")
      await fs.writeFile(path, content)

      indexedFiles.push({
        path: relative(rootDirectoryPath, path),
        isMeta: true,
        sha512HashHex: await getSha512HexHash(content)
      })

      innerLoader.stop()
    }

    const index = dedent`
      hash-format = "sha512"
      
      ${indexedFiles.map(file => dedent`
        [[files]]
        file = ${JSON.stringify(file.path)}
        hash = "${file.sha512HashHex}"
        metafile = ${file.isMeta}
      `).join("\n\n")}
    `

    await fs.writeFile(pack.resolvePath("packwiz/index.toml"), index)
    const indexHash = await getSha512HexHash(index)

    await fs.writeFile(pack.resolvePath("packwiz/pack.toml"), dedent`
      name = ${JSON.stringify(pack.horizrFile.meta.name)}
      authors = ${JSON.stringify(pack.horizrFile.meta.authors.join(", "))}\
      ${pack.horizrFile.meta.description === undefined ? "" : "\n" + `description = ${JSON.stringify(pack.horizrFile.meta.description)}`}
      pack-format = "packwiz:1.0.0"

      [versions]
      minecraft = "${pack.horizrFile.versions.minecraft}"\
      ${pack.horizrFile.loader === "fabric" ? "\n" + `fabric = ${JSON.stringify(pack.horizrFile.versions.loader)}` : ""}

      [index]
      file = "index.toml"
      hash-format = "sha512"
      hash = "${indexHash}"
    `)

    loader.stop()
    output.println(kleur.green("Successfully generated packwiz pack."))
  })

export { packwizCommand}