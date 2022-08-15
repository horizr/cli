# horizr

## CLI
**Note:** Most commands are interactive and therefore not suitable for usage in scripts.

Commands expecting a `MOD_ID` will reuse the ID from the last command if none is provided.

All commands (aside from `init`) expect to find a `horizr.json` file in their current working directory.

### init
Initialize a new pack in the current working directory.

### info
Print information about the pack.

### search NAME
Search for mods by `NAME` and allow selecting one from the results.

Selecting a mod has the same effect as the `mod MOD_ID` subcommand.

### add MOD_ID
Adds the mod to the pack.

### remove MOD_ID
Remove the mod from the pack.

### refresh
Fetches information about updates.

### update MOD_ID
Update the mod to a newer version.

### mod MOD_ID
Print information about the mod.

### export modrinth
Export the pack into `./NAME.mrpack` for Modrinth.

### export packwiz
Export the pack into the `./packwiz` directory for packwiz.
