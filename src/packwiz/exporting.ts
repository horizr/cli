import { AbsolutePath, RelativePath } from "../utils/path.js"
import dedent from "dedent"
import fs from "fs-extra"
import { MetaFile, StaticSourceFile, usePack } from "../pack.js"
import pathModule from "path"
import { computeSha512HexHash, computeSha512HexHashForFile } from "../utils/misc.js"
import { orEmptyString } from "../utils/strings.js"
import { META_FILE_EXTENSION } from "../files.js"

export const PACKWIZ_EXPORT_DIRECTORY_NAME = "packwiz"

export interface IndexedFile {
  path: RelativePath
  sha512HashHex: string
  isMeta: boolean
}

export async function writeAndIndexStaticSourceFile(
  indexedFiles: IndexedFile[],
  outputDirectoryPath: AbsolutePath,
  staticSourceFile: StaticSourceFile
) {
  const outputPath = outputDirectoryPath.resolve(staticSourceFile.effectivePath)

  await fs.mkdirp(outputPath.parent().toString())
  await fs.copy(staticSourceFile.absolutePath.toString(), outputPath.toString())

  indexedFiles.push({
    path: staticSourceFile.effectivePath,
    isMeta: false,
    sha512HashHex: await computeSha512HexHashForFile(outputPath)
  })
}

export async function writeAndIndexMetaFile(indexedFiles: IndexedFile[], outputDirectoryPath: AbsolutePath, metaFile: MetaFile) {
  const updateSection = metaFile.content.source?.type === "modrinth"
    ? dedent`
      \n\n[update]
      [update.modrinth]
      mod-id = ${JSON.stringify(metaFile.content.source.modId)}
      version = ${JSON.stringify(metaFile.content.source.versionId)}
    `
    : ""

  const content = dedent`
    name = ${JSON.stringify(metaFile.content.displayName ?? pathModule.basename(metaFile.relativePath.toString()))}
    filename = ${JSON.stringify(metaFile.content.version.fileName)}
    side = "${metaFile.side.replace("universal", "both")}"

    [download]
    hash-format = "sha512"
    hash = ${JSON.stringify(metaFile.content.version.hashes.sha512)}
    url = ${JSON.stringify(metaFile.content.version.downloadUrl)}${updateSection}
  `

  const relativeOutputPath = metaFile.effectivePath
    .parent()
    .joinedWith(metaFile.absolutePath.getBasename(META_FILE_EXTENSION) + ".toml")

  const outputPath = outputDirectoryPath.resolve(relativeOutputPath)

  await fs.mkdirp(outputPath.parent().toString())
  await fs.writeFile(outputPath.toString(), content)

  indexedFiles.push({
    path: relativeOutputPath,
    isMeta: true,
    sha512HashHex: await computeSha512HexHash(content)
  })
}

export async function writeIndexAndPackManifest(indexedFiles: IndexedFile[], outputDirectoryPath: AbsolutePath) {
  const pack = await usePack()

  const index = dedent`
    hash-format = "sha512"

    ${indexedFiles.map(file => dedent`
      [[files]]
      file = ${JSON.stringify(file.path.toString())}
      hash = "${file.sha512HashHex}"
      metafile = ${file.isMeta}
    `).join("\n\n")}
  `

  await fs.writeFile(outputDirectoryPath.resolve("index.toml").toString(), index)
  const indexHash = await computeSha512HexHash(index)

  await fs.writeFile(outputDirectoryPath.resolve("pack.toml").toString(), dedent`
    name = ${JSON.stringify(pack.manifest.meta.name)}
    author = ${JSON.stringify(pack.manifest.meta.authors.join(", "))}\
    ${orEmptyString(pack.manifest.meta.description, d => `\ndescription = ${JSON.stringify(d)}`)}
    pack-format = "packwiz:1.1.0"
  
    [versions]
    minecraft = ${JSON.stringify(pack.manifest.versions.minecraft)}
    fabric = ${JSON.stringify(pack.manifest.versions.fabric)}
  
    [index]
    file = "index.toml"
    hash-format = "sha512"
    hash = "${indexHash}"
  `)
}
