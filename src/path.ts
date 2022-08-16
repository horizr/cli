import pathModule from "path"
import envPaths from "env-paths"

export class Path {
  constructor(private readonly value: string) {
  }

  /**
   * Returns an absolute path by resolving the last segment against the other segments, this path and the current working directory.
   */
  resolve(...segments: (string | Path)[]) {
    if (this.isAbsolute()) return this
    else return new Path(pathModule.resolve(this.value, ...segments.map(s => s.toString())))
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
  relative(other: Path) {
    return new Path(pathModule.relative(this.value, other.value))
  }

  getParent() {
    return new Path(pathModule.dirname(this.value))
  }

  isAbsolute() {
    return pathModule.isAbsolute(this.value)
  }

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
