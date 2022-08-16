export type ModLoader = "fabric" | "quilt"
export type ReleaseChannel = "alpha" | "beta" | "release"
export const releaseChannelOrder: ReleaseChannel[] = ["alpha", "beta", "release"]

export type Side = "client" | "server" | "client-server"
export const sides: [Side, ...Side[]] = ["client", "server", "client-server"]
