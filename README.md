# Horizr CLI
> A CLI tool for creating Minecraft modpacks, primarily using the Fabric and Quilt loaders. 

🎉 Features:
- Search for mods on [Modrinth](https://modrinth.com/)
- Add mods from Modrinth
- View available (compatible) versions of mods from Modrinth
- View dependencies of specific mod versions
- Check for updates and view changelogs before applying them
- Export the pack to the [`packwiz`](https://packwiz.infra.link/) format
- HTTP-serve the `packwiz` export for usage with [`packwiz-installer`](https://packwiz.infra.link/tutorials/installing/packwiz-installer/)
- Export the pack to the [Modrinth format (`.mrpack`)](https://docs.modrinth.com/docs/modpacks/format_definition/)

## Usage

Because both [pkg](https://github.com/vercel/pkg) and [nexe](https://github.com/nexe/nexe) don’t support ES modules at the time of writing,
I can‘t publish executable files.

The only way of installing is therefore `npm`.

```sh
$ npm i -g @horizr/cli
```

Run any command with the `-h` flag to see the available options.

## Examples

- Activate the latest (compatible) version of [Charm](https://modrinth.com/mod/charm)
```sh
$ horizr modrinth mod activate charm

# or short:
$ horizr mr mod a charm
```

- Activate `v4.1.1` of [Charm](https://modrinth.com/mod/charm)
```sh
$ horizr modrinth mod versions charm

# `BT9G1Jjs` is the version code you are looking for.
# This output will be colored in your console.
BT9G1Jjs 4.2.0+1.18.2 (↓ 137)
featured

Name: [1.18.2] 4.2.0
Channel: release
Minecraft versions: 1.18.2

Publication: last week

https://modrinth.com/mod/pOQTcQmj/version/BT9G1Jjs

# … more versions omitted for brevity

$ horizr modrinth version activate BT9G1Jjs

Charm (4.2.0+1.18.2) was successfully activated.


Dependencies
◉ Fabric API (P7dR8mSH): any version

```

- Check for updates
```sh
$ horizr update
# Because Sodium's version string is not a valid SemVer,
# the publication date will instead be used for comparison.
❯ Sodium has no valid semantic version: mc1.18.2-0.4.1. The
publication date will instead be used.

Available updates
- charm Charm: 4.1.0+1.18.2 → 4.2.0+1.18.2
```

```sh
$ horizr update charm

Changelog for 4.2.0+1.18.2

* Added ebony wood.
* Fixed issue with Totems not always spawning or being
carried away by mobs.
# … omitted for brevity

Apply the update? [Y/n] y

Successfully updated Charm to 4.2.0+1.18.2.
```
