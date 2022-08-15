import { SafeParseError, z, ZodRawShape } from "zod"
import kleur from "kleur"
import fs from "fs-extra"
import * as process from "process"
import { resolve, dirname } from "path"
import { findUp } from "find-up"
import { output } from "./output.js"

export async function findPackDirectoryPath() {
  if (process.argv0.endsWith("/node")) { // run using pnpm
    return resolve(process.cwd(), "./test-pack")
  } else {
    const parent = await findUp("horizr.json")
    if (parent === undefined) return output.failAndExit(`${kleur.yellow("horizr.json")} could not be found in the current working directory or any parent.`)

    return dirname(parent)
  }
}

export async function readJsonFileInPack<S extends z.ZodObject<ZodRawShape>>(
  packPath: string,
  filePath: string,
  schema: S
): Promise<z.output<S> | null> {
  let data

  try {
    data = await fs.readJson(resolve(packPath, filePath))
  } catch (e: unknown) {
    if (e instanceof SyntaxError) return output.failAndExit(`${kleur.yellow(filePath)} does not contain valid JSON.`)
    else return null
  }

  const result = await schema.safeParseAsync(data)
  if (!result.success) {
    const error = (result as SafeParseError<unknown>).error
    return output.failAndExit(`${kleur.yellow(filePath)} is invalid:\n${error.issues.map(issue => `- ${kleur.yellow(issue.path.join("/"))} — ${kleur.red(issue.message)}`).join("\n")}`)
  }

  return result.data
}

export async function writeJsonFileInPack<S extends z.ZodObject<ZodRawShape>>(packPath: string, filePath: string, schema: S, data: z.input<S>) {
  const absolutePath = resolve(packPath, filePath)
  await fs.mkdirp(dirname(absolutePath))

  await fs.writeJson(absolutePath, schema.parse(data), { spaces: 2 })
}

const horizrFileSchema = z.object({
  formatVersion: z.string().or(z.number()),
  meta: z.object({
    name: z.string(),
    version: z.string(),
    authors: z.array(z.string()),
    description: z.string().optional(),
    license: z.string()
  }),
  loader: z.enum(["fabric", "quilt"]),
  versions: z.object({
    minecraft: z.string(),
    loader: z.string()
  })
})

export type HorizrFile = z.output<typeof horizrFileSchema>

export async function readHorizrFile(packPath: string) {
  const data = await readJsonFileInPack(packPath, "horizr.json", horizrFileSchema)
  if (data === null) return output.failAndExit(`${kleur.yellow("horizr.json")} does not exist.`)
  if (data.formatVersion !== 1) return output.failAndExit(`${kleur.yellow("horizr.json")} has unsupported format version: ${kleur.yellow(data.formatVersion)}`)

  return data
}

const modFileModrinthSourceSchema = z.object({
  type: z.literal("modrinth"),
  modId: z.string(),
  versionId: z.string()
})

export type ModFileModrinthSource = z.output<typeof modFileModrinthSourceSchema>

const modFileDataSchema = z.object({
  version: z.string(),
  name: z.string(),
  size: z.number().int().min(0).optional(),
  downloadUrl: z.string().url(),
  hashAlgorithm: z.enum(["sha1", "sha256", "sha512"]),
  hash: z.string()
})

export type ModFileData = z.output<typeof modFileDataSchema>

const modFileSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
  ignoreUpdates: z.boolean().default(false),
  side: z.enum(["client", "server", "client+server"]),
  comment: z.string().optional(),
  file: modFileDataSchema,
  source: z.discriminatedUnion("type", [
    modFileModrinthSourceSchema,
    z.object({ type: z.literal("raw") })
  ])
})

export type ModFile = z.output<typeof modFileSchema>

export async function readModFile(packPath: string, modId: string): Promise<ModFile | null> {
  return await readJsonFileInPack(packPath, `mods/${modId}.json`, modFileSchema)
}

export async function writeModFile(packPath: string, modId: string, data: z.input<typeof modFileSchema>): Promise<void> {
  await writeJsonFileInPack(packPath, `mods/${modId}.json`, modFileSchema, data)
}

export async function removeModFile(packPath: string, modId: string): Promise<void> {
  await fs.remove(resolve(packPath, `mods/${modId}.json`))
}

export async function readModIds(packPath: string) {
  const modsPath = resolve(packPath, "./mods")
  await fs.mkdirp(modsPath)
  const files = await fs.readdir(modsPath, { withFileTypes: true })

  return files.filter(file => file.isFile() && file.name.endsWith(".json")).map(file => file.name.slice(0, -5))
}
