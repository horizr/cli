import { Command } from "commander"
import { Mod, usePack } from "../pack.js"
import fs from "fs-extra"
import dedent from "dedent"
import kleur from "kleur"
import { getLANAddress, getSha512HexHash, httpServeDirectory, optionParsePositiveInteger } from "../utils.js"
import { output } from "../output.js"
import { Visitor, walk } from "@root/walk"
import { Path } from "../path.js"

const packwizCommand = new Command("packwiz")
  .alias("pw")

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

    await serveExportOutput(directoryPath, options.port, options.expose)
  })

// packwizCommand.command("dev")
//   .description("serve + export with hot-reloading.")
//   .option("-s, --server", "Use server overrides instead of client overrides.")
//   .option("-p, --port <port>", "The port of the HTTP server.", optionParsePositiveInteger, 8000)
//   .option("-e, --expose", "Expose the HTTP server on all interfaces.")
//   .action(async options => {
//
//   })

packwizCommand.command("export")
  .description("Generate a packwiz pack in the packwiz directory.")
  .option("-s, --server", "Use server overrides instead of client overrides.")
  .action(async options => {
    await runExport(options.server)
  })

async function runExport(forServer: boolean) {
  const pack = await usePack()

  const loader = output.startLoading("Generating")

  const outputDirectoryPath = pack.paths.generated.resolve("packwiz")
  await fs.remove(outputDirectoryPath.toString())
  await fs.mkdirp(outputDirectoryPath.resolve("mods").toString())

  const indexedFiles: IndexedFile[] = []
  await indexMods(indexedFiles, outputDirectoryPath)

  loader.setText(`Copying and hashing ${forServer ? "server" : "client"} overrides`)
  await copyOverrides(indexedFiles, outputDirectoryPath, forServer)

  loader.setText(`Writing ${kleur.yellow("index.toml")}`)

  await writeIndexAndPackManifest(indexedFiles, outputDirectoryPath)

  loader.stop()
  output.println(kleur.green("Generated packwiz pack"))

  return {
    indexedFiles
  }
}

interface IndexedFile {
  path: string
  sha512HashHex: string
  isMeta: boolean
}

async function writeAndIndexModMetaFile(indexedFiles: IndexedFile[], outputDirectoryPath: Path, mod: Mod) {
  const content = dedent`
      name = ${JSON.stringify(mod.modFile.name)}
      filename = ${JSON.stringify(mod.modFile.file.name)}
      side = "${mod.modFile.side.replace("client-server", "both")}"

      [download]
      hash-format = "sha512"
      hash = ${JSON.stringify(mod.modFile.file.hashes.sha512)}
      url = ${JSON.stringify(mod.modFile.file.downloadUrl)}
    `

  const path = outputDirectoryPath.resolve(`mods/${mod.id}.toml`)
  await fs.writeFile(path.toString(), content)

  indexedFiles.push({
    path: `mods/${mod.id}.toml`,
    isMeta: true,
    sha512HashHex: await getSha512HexHash(content)
  })
}

async function indexMods(indexedFiles: IndexedFile[], outputDirectoryPath: Path, warn: boolean = true) {
  const pack = await usePack()

  for (const mod of pack.mods) {
    if (warn && !mod.modFile.enabled) output.warn(`${kleur.yellow(mod.modFile.name)} is disabled and will not be included.`)

    await output.withLoading(
      writeAndIndexModMetaFile(indexedFiles, outputDirectoryPath, mod),
      `Generating ${kleur.yellow(mod.id + ".toml")} (${indexedFiles.length + 1}/${pack.mods.length})`
    )
  }
}

async function copyOverrides(indexedFiles: IndexedFile[], outputDirectoryPath:Path, forServer: boolean) {
  const pack = await usePack()

  const createVisitor = (overridesDirectoryPath: Path): Visitor => async (error, path, dirent) => {
    const relativePath = overridesDirectoryPath.relative(path)

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

  const specificOverridesDirectoryPath = pack.paths.overrides[forServer ? "server" : "client"]
  const universalOverridesDirectoryPath = pack.paths.overrides["client-server"]

  if (await fs.pathExists(specificOverridesDirectoryPath.toString())) await walk(specificOverridesDirectoryPath.toString(), createVisitor(specificOverridesDirectoryPath))
  if (await fs.pathExists(universalOverridesDirectoryPath.toString())) await walk(universalOverridesDirectoryPath.toString(), createVisitor(universalOverridesDirectoryPath))
}

async function writeIndexAndPackManifest(indexedFiles: IndexedFile[], outputDirectoryPath: Path) {
  const pack = await usePack()

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
    minecraft = ${JSON.stringify(pack.horizrFile.versions.minecraft)}
    fabric = ${JSON.stringify(pack.horizrFile.versions.fabric)}
  
    [index]
    file = "index.toml"
    hash-format = "sha512"
    hash = "${indexHash}"
  `)
}

async function serveExportOutput(path: Path, port: number, expose: boolean) {
  const lanAddress = await getLANAddress()
  const localAddress = `http://localhost:${port}/pack.toml`

  await new Promise<void>(resolve => {
    httpServeDirectory(path, port, expose, () => {
      if (expose) {
        output.println(dedent`
          ${kleur.green("Serving at")}
            Local: ${kleur.yellow(localAddress)}
            Network: ${kleur.yellow(`http://${lanAddress}:${port}/pack.toml`)}
        `)
      } else output.println(`${kleur.green("Serving at")} ${kleur.yellow(localAddress)}`)

      resolve()
    })
  })
}

export { packwizCommand}
