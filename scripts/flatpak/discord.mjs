#!/usr/bin/env node
import { json, exec, args, get } from './lib/index.mjs';

// Discord's per-module "distro manifest" API -- the same one Flathub's own
// com.discordapp.Discord package uses -- gives fixed, hash-verified URLs for the
// real app and each of its modules. The older /api/updates/<channel> endpoint (this
// script's previous implementation) only serves a ~2MB self-bootstrapping installer
// for the "development" channel, which downloads the actual app at runtime instead --
// see com.discordapp.DiscordDevelopment.yaml's apply_extra/discord-development.sh
// comments for why
// that doesn't work inside a Flatpak sandbox (Chromium's zygote self-respawn can't
// see paths outside /app once Flatpak spawns it into its own restricted sandbox).
const PLATFORM = { linux: "linux" };
const ARCH = { x86: "x86", amd64: "x64", arm64: "arm64" };

// Same module set Flathub's manifest fetches (beyond required_modules, adds Krisp
// noise cancellation, Rich Presence, game activity detection, and zstd) for feature
// parity with a normal Discord install.
const MODULES = [
    "discord_desktop_core", "discord_erlpack", "discord_game_utils",
    "discord_krisp", "discord_rpc", "discord_spellcheck",
    "discord_utils", "discord_voice", "discord_zstd",
];

const usage = `(linux) (amd64|arm64) (stable|ptb|canary|development)`;
await exec(usage, true, () => {
    const argv = args(() => {
        const [nodeExecutable, script, platform, arch, channel] = process.argv;
        return { platform, arch, channel };
    });

    const platform = get(argv, PLATFORM, "platform");
    const arch = get(argv, ARCH, "arch");

    return [
        async () => {
            const manifest = await json(
                `https://updates.discord.com/distributions/app/manifests/latest?channel=${argv.channel}&platform=${platform}&arch=${arch}`
            );

            const modules = MODULES
                .filter((name) => manifest.modules[name])
                .map((name) => ({ filename: `${name}_module.tar.br`, url: manifest.modules[name].full.url }));

            return {
                download_uri: manifest.full.url,
                fingerprint: manifest.full.package_sha256,
                version: manifest.full.host_version.join("."),
                modules,
            };
        },
    ];
});
