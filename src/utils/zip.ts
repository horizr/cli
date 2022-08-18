import { AbsolutePath } from "./path.js"
import { ZipFile } from "yazl"
import fs from "fs-extra"
import { walk } from "@root/walk"
import { without } from "lodash-es"
import { pEvent } from "p-event"
import { dirname } from "path"

export async function zipDirectory(directoryPath: AbsolutePath, outputFilePath: AbsolutePath) {
  const zipFile = new ZipFile()
  zipFile.outputStream.pipe(fs.createWriteStream(outputFilePath.toString()))

  let emptyDirectories: string[] = []
  await walk(directoryPath.toString(), async (error, path, dirent) => {
    if (error) return
    if (directoryPath.toString() === path) return true
    if (dirent.name.startsWith(".")) return false

    if (dirent.isDirectory()) {
      emptyDirectories.push(path)
    } else if (dirent.isFile()) {
      zipFile.addFile(path, directoryPath.relativeTo(path).toString(), { compress: true })
    } else return

    emptyDirectories = without(emptyDirectories, dirname(path))
  })

  emptyDirectories.forEach(p => zipFile.addEmptyDirectory(directoryPath.relativeTo(p).toString()))

  zipFile.end()
  await pEvent(zipFile.outputStream, "close")
}
