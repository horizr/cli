![horizr](./banner.png)

# horizr CLI
![npm](https://img.shields.io/npm/v/@horizr/cli?color=white&label=latest%20version&logoColor=red&style=flat-square)

> A CLI tool for creating and maintaining Minecraft modpacks using the Fabric loader.

🎉 Features:
- Add mods from [Modrinth](https://modrinth.com/)
- Check for updates and view changelogs before applying them
- Export the pack to the [Modrinth format (`.mrpack`)](https://docs.modrinth.com/docs/modpacks/format_definition/)
- Export the pack to the [`packwiz`](https://packwiz.infra.link/) format
- HTTP-serve the `packwiz` export for usage with [`packwiz-installer`](https://packwiz.infra.link/tutorials/installing/packwiz-installer/)

## Usage

Because both [pkg](https://github.com/vercel/pkg) and [nexe](https://github.com/nexe/nexe) don’t support ES modules at the time of writing,
I can’t publish executable files.

The only way of installing is therefore `npm`.

```sh
$ npm i -g @horizr/cli
```

Run any command with the `-h` flag to see the available options.

A new pack can be initialized using `horizr init <path>`.

## Contributing

I developed this tool primarily for my own packs, that’s why its missing some features I didn’t absolutely need.

Nevertheless, if you want a feature added, feel free to [create an issue](https://github.com/horizr/cli/issues/new).
A pull request would be even better.

Features I have in mind:
- List disabled source files
- Allow disabling static source files by adding `.disabled` to their name
- Import packwiz packs
- Hot-reloading `packwiz dev` command
