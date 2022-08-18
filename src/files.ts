import { AbsolutePath, envPaths, RelativePath } from "./utils/path.js"
import process from "process"
import { findUp } from "find-up"
import { output } from "./utils/output.js"
import kleur from "kleur"
import { SafeParseError, z, ZodRawShape } from "zod"
import fs from "fs-extra"
import { dirname } from "path"
import fastGlob from "fast-glob"
import { sides } from "./pack.js"

export async function findPackDirectoryPath(): Promise<AbsolutePath> {
  if (process.argv0.endsWith("/node")) { // run using pnpm
    return envPaths.cwd.resolve("./test-pack")
  } else {
    const parent = await findUp(PACK_MANIFEST_FILE_NAME)
    if (parent === undefined) return output.failAndExit(`${kleur.yellow(PACK_MANIFEST_FILE_NAME)} could not be found in the current working directory or any parent.`)

    return AbsolutePath.create(dirname(parent))
  }
}

export async function writeJsonFile<S extends z.ZodObject<ZodRawShape>>(path: AbsolutePath, schema: S, data: z.input<S>) {
  await fs.mkdirp(path.parent().toString())
  await fs.writeJson(path.toString(), schema.parse(data), { spaces: 2 })
}

export async function readJsonFile<S extends z.ZodObject<ZodRawShape>>(rootPath: AbsolutePath, specificPath: RelativePath, schema: S): Promise<z.output<S> | null> {
  let data

  try {
    data = await fs.readJson(rootPath.resolve(specificPath).toString())
  } catch (e: unknown) {
    if (e instanceof SyntaxError) return output.failAndExit(`${kleur.yellow(specificPath.toString())} does not contain valid JSON.`)
    else return null
  }

  const result = await schema.safeParseAsync(data)
  if (!result.success) {
    const error = (result as SafeParseError<unknown>).error
    return output.failAndExit(`${kleur.yellow(specificPath.toString())} is invalid:\n${error.issues.map(issue => `- ${kleur.yellow(issue.path.join("/"))} — ${kleur.red(issue.message)}`).join("\n")}`)
  }

  return result.data
}

export const PACK_MANIFEST_FORMAT_VERSION = 1
export const PACK_MANIFEST_FILE_NAME = "horizr.json"

export const horizrFileSchema = z.object({
  formatVersion: z.literal(PACK_MANIFEST_FORMAT_VERSION),
  meta: z.object({
    name: z.string(),
    version: z.string(),
    authors: z.array(z.string()),
    description: z.string().optional(),
    license: z.string()
  }),
  versions: z.object({
    minecraft: z.string(),
    fabric: z.string()
  })
})

export type PackManifest = z.output<typeof horizrFileSchema>

export const META_FILE_EXTENSION = "hm.json"

const metaFileModrinthSourceSchema = z.object({
  type: z.literal("modrinth"),
  modId: z.string(),
  versionId: z.string()
})

export type MetaFileModrinthSource = z.output<typeof metaFileModrinthSourceSchema>

const metaFileContentVersionSchema = z.object({
  name: z.string(),
  size: z.number().int().min(0).optional(),
  fileName: z.string(),
  downloadUrl: z.string().url(),
  hashes: z.object({
    sha1: z.string(),
    sha512: z.string()
  })
})

export type MetaFileContentVersion = z.output<typeof metaFileContentVersionSchema>

export const metaFileContentSchema = z.object({
  displayName: z.string().optional(),
  enabled: z.boolean().default(true),
  comment: z.string().optional(),
  version: metaFileContentVersionSchema,
  source: z.discriminatedUnion("type", [
    metaFileModrinthSourceSchema,
    z.object({ type: z.literal("raw") })
  ]).and(z.object({
    ignoreUpdates: z.boolean().default(false)
  })).optional()
})

export type MetaFileContent = z.output<typeof metaFileContentSchema>

export const listSourceFiles = (sourceDirectoryPath: AbsolutePath) => fastGlob(sides.map(side => `${side}/**/*`), {
  cwd: sourceDirectoryPath.toString(),
  followSymbolicLinks: false,
  onlyFiles: true
}).then(paths => paths.map(path => RelativePath.create(path)))
