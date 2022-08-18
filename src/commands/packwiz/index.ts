import { Command } from "commander"
// import { importCommand } from "./import.js"
import { serveCommand } from "./serve.js"
import { exportCommand } from "./export.js"

export const packwizCommand = new Command("packwiz")
  .alias("pw")
  .addCommand(exportCommand)
  // .addCommand(importCommand)
  .addCommand(serveCommand)
