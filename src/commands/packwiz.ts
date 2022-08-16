import { Command } from "commander"
import { usePack } from "../pack.js"
import fs from "fs-extra"
import dedent from "dedent"
import kleur from "kleur"
import { getLANAddress, getSha512HexHash, httpServeDirectory, optionParsePositiveInteger } from "../utils.js"
import { output } from "../output.js"
import { Visitor, walk } from "@root/walk"
import { Path } from "../path.js"

const packwizCommand = new Command("packwiz")

interface IndexedFile {
  path: string
  sha512HashHex: string
  isMeta: boolean
}

packwizCommand.command("import")
  .description("Import a packwiz pack.")
  .action(async () => {
    output.failAndExit("Not implemented.")
    // TODO: Import packwiz pack
  })

packwizCommand.command("serve")
  .description("Start an HTTP server in the packwiz directory.")
  .option("-p, --port <port>", "The port of the HTTP server.", optionParsePositiveInteger, 8000)
  .option("-e, --expose", "Expose the HTTP server on all interfaces.")
  .action(async options => {
    const pack = await usePack()
    const directoryPath = pack.paths.generated.resolve("packwiz")
    if (!(await fs.pathExists(directoryPath.toString())))
      output.failAndExit(`The ${kleur.yellow("packwiz")} directory does not exist. Generate it by running ${kleur.yellow("horizr packwiz export")}.`)

    const lanAddress = await getLANAddress()

    httpServeDirectory(directoryPath, options.port, options.expose, () => {
      const localAddress = `http://localhost:${options.port}/pack.toml`

      if (options.expose) {
        output.println(dedent`
          ${kleur.green("Serving at")}
            Local: ${kleur.yellow(localAddress)}
            Network: ${kleur.yellow(`http://${lanAddress}:${options.port}/pack.toml`)}
        `)
      }
      else output.println(`${kleur.green("Serving at")} ${kleur.yellow(localAddress)}`)
    })
  })

packwizCommand.command("dev")
  .description("serve + export with hot-reloading.")
  .action(async () => {
    output.failAndExit("Not implemented.")
    // TODO: serve and export with hot-reloading
  })

packwizCommand.command("export")
  .description("Generate a packwiz pack in the packwiz directory.")
  .option("-s, --server", "Use server overrides instead of client overrides.")
  .action(async options => {
    const pack = await usePack()

    if (pack.horizrFile.loader !== "fabric")
      output.println(kleur.yellow(`packwiz does not yet support the ${kleur.reset(pack.horizrFile.loader)} loader. No loader will be specified.`))

    const loader = output.startLoading("Generating")

    const outputDirectoryPath = pack.paths.generated.resolve("packwiz")
    const modsDirectoryPath = outputDirectoryPath.resolve("mods")
    await fs.remove(outputDirectoryPath.toString())
    await fs.mkdirp(modsDirectoryPath.toString())

    const indexedFiles: IndexedFile[] = []
    for (const mod of pack.mods) {
      if (!mod.modFile.enabled) output.warn(`${kleur.yellow(mod.modFile.name)} is disabled and will not be included.`)
      const innerLoader = output.startLoading(`Generating ${kleur.yellow(mod.id + ".toml")} (${indexedFiles.length + 1}/${pack.mods.length})`)

      const content = dedent`
        name = ${JSON.stringify(mod.modFile.name)}
        filename = ${JSON.stringify(mod.modFile.file.name)}
        side = "${mod.modFile.side.replace("client+server", "both")}"

        [download]
        hash-format = "sha512"
        hash = ${JSON.stringify(mod.modFile.file.hashes.sha512)}
        url = ${JSON.stringify(mod.modFile.file.downloadUrl)}
      `

      const path = modsDirectoryPath.resolve(mod.id + ".toml")
      await fs.writeFile(path.toString(), content)

      indexedFiles.push({
        path: outputDirectoryPath.relative(path).toString(),
        isMeta: true,
        sha512HashHex: await getSha512HexHash(content)
      })

      innerLoader.stop()
    }

    loader.setText(`Copying and hashing ${options.server ? "server" : "client"} overrides`)

    const createVisitor = (overridesDirectoryPath: Path): Visitor => async (error, path, dirent) => {
      const relativePath = overridesDirectoryPath.relative(Path.create(path))

      if (error) output.warn(`${kleur.yellow(relativePath.toString())}: ${error.message}`)
      else {
        if (dirent.name.startsWith(".")) return false
        if (dirent.isFile()) {
          const outputPath = outputDirectoryPath.resolve(relativePath)
          await fs.mkdirp(outputPath.getParent().toString())
          await fs.copy(path, outputPath.toString())

          indexedFiles.push({
            path: relativePath.toString(),
            isMeta: false,
            sha512HashHex: await getSha512HexHash(await fs.readFile(overridesDirectoryPath.resolve(path).toString()))
          })
        }
      }
    }

    const specificOverridesDirectoryPath = pack.paths.overrides[options.server ? "server" : "client"]
    const universalOverridesDirectoryPath = pack.paths.overrides["client-server"]

    if (await fs.pathExists(specificOverridesDirectoryPath.toString())) await walk(specificOverridesDirectoryPath.toString(), createVisitor(specificOverridesDirectoryPath))
    if (await fs.pathExists(universalOverridesDirectoryPath.toString())) await walk(universalOverridesDirectoryPath.toString(), createVisitor(universalOverridesDirectoryPath))

    loader.setText(`Writing ${kleur.yellow("index.toml")}`)

    const index = dedent`
      hash-format = "sha512"

      ${indexedFiles.map(file => dedent`
        [[files]]
        file = ${JSON.stringify(file.path)}
        hash = "${file.sha512HashHex}"
        metafile = ${file.isMeta}
      `).join("\n\n")}
    `

    await fs.writeFile(outputDirectoryPath.resolve("index.toml").toString(), index)
    const indexHash = await getSha512HexHash(index)

    await fs.writeFile(outputDirectoryPath.resolve("pack.toml").toString(), dedent`
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
    output.println(kleur.green("Generated packwiz pack"))
  })

export { packwizCommand}
