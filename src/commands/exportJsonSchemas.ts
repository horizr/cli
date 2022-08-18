import { Command } from "commander"
import fs from "fs-extra"
import { zodToJsonSchema } from "zod-to-json-schema"
import { metaFileContentSchema, packManifestFileSchema } from "../files.js"

export const exportJsonSchemasCommand = new Command("export-json-schemas")
  .argument("<path>")
  .description("Exports the pack manifest and meta-file JSON schemas.")
  .action(async path => {
    await fs.mkdirp(path)
    await fs.writeJson(path + "/manifest.schema.json", {
      title: "Horizr pack manifest",
      $id: "https://horizr.moritzruth.de/schemas/pack/manifest.schema.json",
      ...zodToJsonSchema(packManifestFileSchema),
      $schema: "https://json-schema.org/draft-07/schema" // HTTPS
    }, { spaces: 2 })

    await fs.writeJson(path + "/meta-file.schema.json", {
      title: "Horizr pack meta-file",
      $id: "https://horizr.moritzruth.de/schemas/pack/meta-file.schema.json",
      ...zodToJsonSchema(metaFileContentSchema),
      $schema: "https://json-schema.org/draft-07/schema" // HTTPS
    }, { spaces: 2 })
  })
