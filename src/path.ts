import pathModule from "path"
import envPaths from "env-paths"

export class Path {
  constructor(private readonly value: string) {
  }

  /**
   * Returns an absolute path by resolving the last segment against the other segments, this path and the current working directory.
   */
  resolve(...segments: (string | Path)[]) {
    return new Path(pathModule.resolve(this.value, ...segments.map(s => s.toString())))
  }

  /**
   * Returns a new path with this path and the segments joined together.
   */
  join(...segments: (string | Path)[]) {
    return new Path(pathModule.join(this.value, ...segments.map(s => s.toString())))
  }

  /**
   * Returns the relative path from this path to the other path.
   */
  relative(other: Path | string) {
    return new Path(pathModule.relative(this.value, typeof other === "string" ? other : other.toString()))
  }

  getParent() {
    return new Path(pathModule.dirname(this.value))
  }

  isAbsolute() {
    return pathModule.isAbsolute(this.value)
  }

  // Not tested
  // isDescendantOf(other: Path) {
  //   if (!(this.isAbsolute() && other.isAbsolute())) throw new Error("Both paths must be absolute")
  //   return pathModule.relative(this.value, other.value).split("/").includes("..")
  // }

  toString() {
    return this.value
  }

  static create(...segments: string[]) {
    if (segments.length === 0) throw new Error("At least one segment is required")

    return new Path(pathModule.join(...segments))
  }

  static createAbsolute(...segments: string[]) {
    if (segments.length === 0) throw new Error("At least one segment is required")

    return new Path(pathModule.resolve(...segments))
  }
}

const rawPaths = envPaths("horizr", { suffix: "" })
export const paths = {
  cache: new Path(rawPaths.cache),
  config: new Path(rawPaths.config),
  data: new Path(rawPaths.data),
  log: new Path(rawPaths.log),
  temp: new Path(rawPaths.temp)
}
