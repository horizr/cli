import { Command } from "commander"
import { activateCommand } from "./activate.js"
import dedent from "dedent"
import kleur from "kleur"

export const modrinthCommand = new Command("modrinth")
  .alias("mr")
  .addCommand(activateCommand)
  .addHelpText("after", dedent`
    ${kleur.yellow("<code>")} may be one of the following:
    - URL or slug of a Modrinth mod (${kleur.yellow("https://modrinth.com/mod/sodium")} or ${kleur.yellow("sodium")})
    - URL of a Modrinth mod version (${kleur.yellow("https://modrinth.com/mod/sodium/version/mc1.19-0.4.2")})
    - slug of a Modrinth mod and a version with a ${kleur.yellow("@")} in between (${kleur.yellow("sodium:mc1.19-0.4.2")})
    - Modrinth project ID (${kleur.yellow("AANobbMI")} for Sodium)
    - Modrinth version ID, prefixed with ${kleur.yellow("@")} (${kleur.yellow("@Yp8wLY1P")} for Sodium mc1.19-0.4.2)
  `)
