import { AbsolutePath, envPaths, RelativePath } from "./utils/path.js"
import {
  findPackDirectoryPath,
  PackManifest,
  horizrFileSchema,
  MetaFileContent,
  PACK_MANIFEST_FILE_NAME,
  metaFileContentSchema,
  writeJsonFile,
  listSourceFiles,
  readJsonFile, META_FILE_EXTENSION
} from "./files.js"
import { z, ZodRawShape } from "zod"
import { fetchModrinthModUpdates } from "./modrinth/updating.js"
import { createCpuCoreLimiter } from "./utils/promises.js"
import { output } from "./utils/output.js"
import pathModule from "path"
import kleur from "kleur"
import { orEmptyString } from "./utils/strings.js"
import fs from "fs-extra"

export type ReleaseChannel = "alpha" | "beta" | "release"
export const releaseChannelOrder: ReleaseChannel[] = ["alpha", "beta", "release"]

export type Side = "client" | "server" | "universal"
export const sides: [Side, ...Side[]] = ["client", "server", "universal"]

export interface Pack {
  manifest: PackManifest

  paths: {
    root: AbsolutePath
    source: AbsolutePath
    exports: AbsolutePath
  }

  metaFiles: MetaFile[]
  staticSourceFiles: StaticSourceFile[]
  getMetaFile(path: RelativePath): MetaFile | null
  getMetaFileFromInput(input: string): MetaFile
  getEffectiveMetaFile(path: RelativePath, side: Side): MetaFile | null
  registerCreatedSourceFile(path: RelativePath): Promise<void>

  readSourceJsonFile<S extends z.ZodObject<ZodRawShape>>(path: RelativePath, schema: S): Promise<z.output<S> | null>
}

export interface SourceFile {
  isStatic: boolean
  isMod: boolean
  side: Side
  relativePath: RelativePath
  absolutePath: AbsolutePath
  effectivePath: RelativePath
}

export interface MetaFile extends SourceFile {
  isStatic: false
  content: MetaFileContent
  fetchUpdates: null | ((allowedReleaseChannels: ReleaseChannel[]) => Promise<Update[]>)
  saveContent(): Promise<void>

  getDisplayString(): string
}

export interface StaticSourceFile extends SourceFile {
  isStatic: true
}

export interface Update {
  of: MetaFile
  versionString: string
  changelog: string | null
  apply(): Promise<void>
}

let pack: Pack
export async function usePack(): Promise<Pack> {
  if (pack === undefined) {
    const rootDirectoryPath = await findPackDirectoryPath()
    const sourceDirectoryPath = rootDirectoryPath.resolve("src")
    const readSourceJsonFile: Pack["readSourceJsonFile"] = async (path, schema) => readJsonFile(sourceDirectoryPath, path, schema)

    const manifest = (await readJsonFile(rootDirectoryPath, RelativePath.create(PACK_MANIFEST_FILE_NAME), horizrFileSchema))!

    const metaFiles: MetaFile[] = []
    const staticSourceFiles: StaticSourceFile[] = []

    const registerSourceFile: Pack["registerCreatedSourceFile"] = async relativePath => {
      const absolutePath = sourceDirectoryPath.resolve(relativePath)
      if (!await fs.pathExists(absolutePath.toString())) throw new Error("File does not exist: " + absolutePath)

      const pathSegments = relativePath.toString().split("/")

      const sourceFile: SourceFile = {
        isStatic: false,
        isMod: pathSegments[1] === "mods",
        side: pathSegments[0] as Side,
        relativePath: relativePath,
        absolutePath: sourceDirectoryPath.resolve(relativePath),
        effectivePath: RelativePath._createDirect(pathSegments.slice(1).join("/")),
      }

      if (relativePath.toString().endsWith("." + META_FILE_EXTENSION)) {
        const content = (await readSourceJsonFile(relativePath, metaFileContentSchema))!
        const { source } = content

        const metaFile: MetaFile = {
          ...sourceFile,
          isStatic: false,
          content,
          fetchUpdates: source?.type === "modrinth"
            ? allowedReleaseChannels => fetchModrinthModUpdates(metaFile, source, allowedReleaseChannels, manifest.versions.minecraft)
            : null,
          async saveContent() {
            await writeJsonFile(sourceDirectoryPath.resolve(relativePath), metaFileContentSchema, this.content)
          },
          getDisplayString: () => `${kleur.yellow(metaFile.relativePath.toString())}${orEmptyString(metaFile.content.displayName, v => " " + kleur.blue(v))}`
        }

        metaFiles.push(metaFile)
      } else {
        staticSourceFiles.push({
          ...sourceFile,
          isStatic: true
        })
      }
    }

    const sourceFilePaths = await listSourceFiles(sourceDirectoryPath)
    const limit = createCpuCoreLimiter()
    await Promise.all(sourceFilePaths.map(path => limit(() => registerSourceFile(path))))

    pack = {
      paths: {
        root: rootDirectoryPath,
        source: sourceDirectoryPath,
        exports: rootDirectoryPath.resolve("exports")
      },
      manifest,
      metaFiles,
      staticSourceFiles,
      readSourceJsonFile,
      registerCreatedSourceFile: registerSourceFile,
      getMetaFile(relativePath: RelativePath) {
        return metaFiles.find(metaFile => metaFile.relativePath.is(relativePath)) ?? null
      },
      getEffectiveMetaFile(effectivePath: RelativePath, side: Side) {
        return metaFiles.find(metaFile => metaFile.side === side && metaFile.effectivePath.is(effectivePath)) ?? null
      },
      getMetaFileFromInput(input: string): MetaFile {
        const path = envPaths.cwd.resolveAny(input)
        if (!path.isDescendantOf(sourceDirectoryPath)) output.failAndExit(`${kleur.yellow(pathModule.normalize(input))} is outside the source directory.`)

        const relativePath = sourceDirectoryPath.relativeTo(path.toString().endsWith("." + META_FILE_EXTENSION) ? path : (path.toString() + "." + META_FILE_EXTENSION))

        const metaFile = this.getMetaFile(relativePath)
        if (metaFile === null) return output.failAndExit(`${kleur.yellow(relativePath.toString())} does not exist.`)

        return metaFile
      }
    }
  }

  return pack
}
