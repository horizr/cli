import { Command } from "commander"
import { envPaths } from "../utils/path.js"
import fs from "fs-extra"
import { output } from "../utils/output.js"
import kleur from "kleur"
import { fetchFabricMinecraftVersions, fetchFabricVersions } from "../fabricApi.js"
import enquirer from "enquirer"
import { PACK_MANIFEST_FILE_NAME, FORMAT_VERSION, PackManifest } from "../files.js"
import pathModule from "path"
import { EXPORTS_DIRECTORY_NAME } from "../pack.js"
import slugify from "@sindresorhus/slugify"

export const initCommand = new Command("init")
  .argument("<path>")
  .description("Initialize a new pack in the directory.")
  .action(async pathString => {
    const path = envPaths.cwd.resolveAny(pathString)
    const manifestFilePath = path.resolve(PACK_MANIFEST_FILE_NAME)

    if (await fs.pathExists(manifestFilePath.toString())) output.failAndExit(`${kleur.yellow(PACK_MANIFEST_FILE_NAME)} already exists in the directory.`)

    await fs.mkdirp(path.toString())
    const minecraftVersions = await output.withLoading(fetchFabricMinecraftVersions(), "Fetching Minecraft versions")

    const answers: any = await enquirer.prompt([
      {
        name: "name",
        type: "input",
        message: "Name",
        validate: answer => answer.length === 0 ? "An answer is required." : true
      },
      {
        name: "authors",
        type: "input",
        message: "Authors (comma-separated)",
        validate: answer => answer.length === 0 ? "An answer is required." : true
      },
      {
        name: "description",
        type: "text",
        message: "Description"
      },
      {
        name: "license",
        type: "text",
        message: "License (SPDX-ID)",
        validate: answer => answer.length === 0 ? "An answer is required." : true
      },
      {
        name: "minecraftVersion",
        type: "autocomplete",
        message: "Minecraft version",
        choices: minecraftVersions.map(version => ({
          name: version,
          value: version
        })),
        // @ts-expect-error
        limit: 10,
        validate: answer => minecraftVersions.includes(answer) ? true : "Please select a version from the list."
      }
    ])

    const fabricVersion = (await output.withLoading(fetchFabricVersions(answers.minecraftVersion), "Fetching latest Fabric version"))[0]

    const file: PackManifest = {
      formatVersion: FORMAT_VERSION,
      slug: slugify(answers.name),
      meta: {
        name: answers.name,
        version: "1.0.0",
        description: answers.description === "" ? undefined : answers.description,
        authors: (answers.authors as string).split(", ").map(a => a.trim()),
        license: answers.license
      },
      versions: {
        minecraft: answers.minecraftVersion,
        fabric: fabricVersion
      }
    }

    await fs.writeJson(manifestFilePath.toString(), file, { spaces: 2 })
    await fs.writeFile(path.resolve(".gitignore").toString(), `/${EXPORTS_DIRECTORY_NAME}/`)

    output.println(kleur.green(`Successfully initialized pack in ${kleur.yellow(pathModule.normalize(pathString))}`))
  })
