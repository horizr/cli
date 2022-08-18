import pathModule from "path"
import getEnvPaths from "env-paths"

interface AbstractPath {
  isDescendantOf(other: Path): boolean
  is(other: Path | string): boolean

  getBasename(): string

  toAbsolute(): AbsolutePath
  toString(): string
}

export type Path = AbsolutePath | RelativePath

export class RelativePath implements AbstractPath {
  private constructor(private readonly pathString: string) {
  }

  isDescendantOf(other: Path) {
    return this.pathString !== "" && !this.pathString.split("/").includes("..")
  }

  resolveInCwd(...segments: (string | RelativePath)[]): AbsolutePath {
    return AbsolutePath._createDirect(pathModule.resolve(this.pathString, ...segments.map(s => s.toString())))
  }

  joinedWith(...segments: (string | Path)[]): RelativePath {
    return RelativePath._createDirect(pathModule.join(this.pathString, ...segments.map(s => s.toString())))
  }

  parent(): RelativePath {
    return RelativePath._createDirect(pathModule.dirname(this.pathString))
  }

  is(other: Path | string): boolean {
    return this.pathString === (typeof other === "string" ? pathModule.normalize(other) : other.toString())
  }

  getBasename(): string {
    return pathModule.basename(this.pathString)
  }

  toAbsolute(): AbsolutePath {
    return envPaths.cwd.resolve(this)
  }

  toString(): string {
    return this.pathString
  }

  static create(pathString: string) {
    if (pathModule.isAbsolute(pathString)) throw new Error("pathString is not relative")
    return new RelativePath(pathModule.normalize(pathString))
  }

  static _createDirect(pathString: string) {
    return new RelativePath(pathString)
  }
}

export class AbsolutePath implements AbstractPath {
  private constructor(private readonly pathString: string) {
  }

  isDescendantOf(other: Path) {
    if (other instanceof AbsolutePath) {
      return other.relativeTo(this).isDescendantOf(this)
    } else return other.isDescendantOf(this)
  }

  resolve(...segments: (string | RelativePath)[]): AbsolutePath {
    return new AbsolutePath(pathModule.resolve(this.pathString, ...segments.map(s => s.toString())))
  }

  resolveAny(...segments: (string | Path)[]): AbsolutePath {
    return new AbsolutePath(pathModule.resolve(this.pathString, ...segments.map(s => s.toString())))
  }

  joinedWith(...segments: (string | RelativePath)[]): AbsolutePath {
    return new AbsolutePath(pathModule.join(this.pathString, ...segments.map(s => s.toString())))
  }

  parent(): AbsolutePath {
    return new AbsolutePath(pathModule.dirname(this.pathString))
  }

  relativeTo(other: Path | string): RelativePath {
    if (other instanceof RelativePath) return other
    else return RelativePath._createDirect(pathModule.relative(this.pathString, typeof other === "string" ? other : other.toString()))
  }

  is(other: Path | string): boolean {
    return this.pathString === (typeof other === "string" ? pathModule.normalize(other) : other.toString())
  }

  getBasename(): string {
    return pathModule.basename(this.pathString)
  }

  /**
   * @deprecated Unnecessary.
   */
  toAbsolute(): AbsolutePath {
    return this
  }

  toString(): string {
    return this.pathString
  }

  static create(pathString: string) {
    if (!pathModule.isAbsolute(pathString)) throw new Error("pathString is not absolute")
    return new AbsolutePath(pathModule.normalize(pathString))
  }

  static _createDirect(pathString: string) {
    return new AbsolutePath(pathString)
  }
}

const rawPaths = getEnvPaths("horizr", { suffix: "" })

export const envPaths = {
  cache: AbsolutePath.create(rawPaths.cache),
  config: AbsolutePath.create(rawPaths.config),
  data: AbsolutePath.create(rawPaths.data),
  log: AbsolutePath.create(rawPaths.log),
  temp: AbsolutePath.create(rawPaths.temp),
  cwd: AbsolutePath.create(process.cwd())
}
