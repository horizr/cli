import { IterableElement } from "type-fest"
import { sortBy } from "lodash-es"
import { Mod, Pack, usePack } from "../pack.js"
import { ModFile, ModFileData, MetaFileModrinthSource } from "../files.js"
import { pathExists } from "fs-extra"
import { nanoid } from "nanoid/non-secure"
import { output } from "../../src/utils/output.js"
import kleur from "kleur"
import { ModrinthMod, ModrinthVersion, ModrinthVersionFile } from "./api.js"
import { releaseChannelOrder, Side } from "../shared.js"

export async function addModrinthMod(modrinthMod: ModrinthMod, modrinthVersion: ModrinthVersion, side?: Side) {
  const pack = await usePack()
  let id = modrinthMod.slug

  if (await pathExists(pack.paths.mods.resolve(`${id}.json`).toString())) {
    const oldId = id
    id = `${id}-${nanoid(5)}`

    output.warn(
      `There is already a mod file named ${kleur.yellow(`${oldId}.json`)} specifying a non-Modrinth mod.\n` +
      `The file for this mod will therefore be named ${kleur.yellow(`${id}.json`)}`
    )
  }

  if (side === undefined) {
    const isClientSupported = modrinthMod.clientSide !== "unsupported"
    const isServerSupported = modrinthMod.serverSide !== "unsupported"

    side = isClientSupported && isServerSupported ? "client-server" : isClientSupported ? "client" : "server"
  }

  await pack.addMod(id, {
    name: modrinthMod.title,
    enabled: true,
    ignoreUpdates: false,
    side,
    file: getModFileDataForModrinthVersion(modrinthMod, modrinthVersion),
    source: {
      type: "modrinth",
      modId: modrinthMod.id,
      versionId: modrinthVersion.id
    }
  })
}


