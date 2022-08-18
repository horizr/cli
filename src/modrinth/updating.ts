import { MetaFile, ReleaseChannel, Update } from "../pack.js"
import { MetaFileModrinthSource } from "../files.js"
import { modrinthApi, ModrinthVersion } from "./api.js"
import semver from "semver"
import { getMetaFileContentVersionForModrinth } from "./index.js"
import { sortBy } from "lodash-es"

async function fetchNewerModrinthVersions(
  activeVersion: string,
  source: MetaFileModrinthSource,
  allowedReleaseChannels: ReleaseChannel[],
  minecraftVersion: string
): Promise<ModrinthVersion[]> {
  const activeSemver = semver.parse(activeVersion)
  const availableVersions = await modrinthApi.listVersions(source.modId, minecraftVersion)
  const allowedVersions = availableVersions.filter(version => allowedReleaseChannels.includes(version.releaseChannel))

  if (activeSemver === null) {
    const activePublicationDate = allowedVersions.find(v => v.id === source.versionId)?.publicationDate
    if (activePublicationDate === undefined) return allowedVersions

    return allowedVersions.filter(v => v.publicationDate.toISOString() > activePublicationDate.toISOString())
  } else {
    return allowedVersions.filter(version => {
      const thisSemver = semver.parse(version.versionString)

      // If mods switch to a non-SemVer version scheme, all new versions are considered older.
      // This may be a problem.
      if (thisSemver === null) return false

      return thisSemver.compare(activeSemver) === 1
    })
  }
}

export async function fetchModrinthModUpdates(
  metaFile: MetaFile,
  source: MetaFileModrinthSource,
  allowedReleaseChannels: ReleaseChannel[],
  minecraftVersion: string
): Promise<Update[]> {
  const sorted = sortBy(await fetchNewerModrinthVersions(metaFile.content.version.name, source, allowedReleaseChannels, minecraftVersion), v => v.publicationDate.toISOString())
    .reverse()

  return sorted.map(modrinthVersion => ({
    of: metaFile,
    versionString: modrinthVersion.versionString,
    changelog: modrinthVersion.changelog,
    async apply() {
      metaFile.content.version = getMetaFileContentVersionForModrinth(modrinthVersion)
      source.versionId = modrinthVersion.id

      await metaFile.saveContent()
    }
  }))
}
