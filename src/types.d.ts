declare module "@root/walk" {
  import { Dirent } from "fs"
  export type Visitor = (error: Error, path: string, dirent: Dirent) => Promise<boolean | undefined>

  export function walk(path: string, visitor: Visitor): Promise<void>
}
