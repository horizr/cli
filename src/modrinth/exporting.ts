import { AbsolutePath } from "../utils/path.js"
import { output } from "../utils/output.js"
import fs from "fs-extra"
import { Side, usePack } from "../pack.js"
import kleur from "kleur"
import { mapNotNull } from "../utils/collections.js"

const overridesDirectoryNameBySide: Record<Side, string> = {
  client: "client-overrides",
  server: "server-overrides",
  universal: "overrides"
}

export async function generateOutputDirectory(outputDirectoryPath: AbsolutePath) {
  const pack = await usePack()
  await fs.remove(outputDirectoryPath.toString())
  await fs.mkdirp(outputDirectoryPath.toString())

  await fs.writeJson(outputDirectoryPath.resolve("modrinth.index.json").toString(), {
    formatVersion: 1,
    game: "minecraft",
    versionId: pack.manifest.meta.version,
    name: pack.manifest.meta.name,
    summary: pack.manifest.meta.description,
    dependencies: {
      minecraft: pack.manifest.versions.minecraft,
      "fabric-loader": pack.manifest.versions.fabric
    },
    files: mapNotNull(pack.metaFiles, metaFile => metaFile.content.enabled ? ({
      path: metaFile.effectivePath.toString(),
      hashes: {
        sha1: metaFile.content.version.hashes.sha1,
        sha512: metaFile.content.version.hashes.sha512
      },
      env: {
        client: metaFile.side === "client" || metaFile.side === "universal" ? "required" : "unsupported",
        server: metaFile.side === "server" || metaFile.side === "universal" ? "required" : "unsupported"
      },
      downloads: [
        metaFile.content.version.downloadUrl
      ],
      fileSize: metaFile.content.version.size
    }) : null)
  }, { spaces: 2 })

  let i = 0
  for (const staticSourceFile of pack.staticSourceFiles) {
    i++
    const loader = output.startLoading(`Exporting static source file (${i}/${pack.staticSourceFiles.length}): ${kleur.yellow(staticSourceFile.relativePath.toString())}`)
    const outputPath = outputDirectoryPath.resolve(overridesDirectoryNameBySide[staticSourceFile.side], staticSourceFile.effectivePath)
    await fs.mkdirp(outputPath.parent().toString())
    await fs.copy(staticSourceFile.absolutePath.toString(), outputPath.toString())

    // Workaround for https://github.com/PolyMC/PolyMC/issues/1060
    if (staticSourceFile.side === "client") {
      await fs.mkdirp(outputDirectoryPath.resolve(overridesDirectoryNameBySide.universal, staticSourceFile.effectivePath).parent().toString())
    }

    loader.stop()
  }
}
