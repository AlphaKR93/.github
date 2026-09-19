#!/usr/bin/env node
import { json, head, exec, args, queryParams, get } from './lib/index.mjs';

const ARCH = {
    windows: { x86: "win", amd64: "win/x64", arm64: "win/arm64" },
    mac: { x86: null, amd64: null, arm64: "osx" },
    linux: { x86: "linux", amd64: "linux", arm64: null },
};

/**
 * @param {string} value
 * @returns {string}
 */
const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const LINUX_FORMAT = "tar.gz";

/**
 * @type {Record<"windows" | "mac" | "linux", (channel: string, version: string) => string>}
 */
const FORMAT = {
    windows: (channel, _) => `Discord${capitalize(channel)}Setup.exe`,
    mac: (channel, _) => `Discord${capitalize(channel)}.dmg`,
    linux: (channel, version) => `discord-${channel}-${version}.${LINUX_FORMAT}`,
}

const usage = `\
(windows|mac|linux) (amd64|arm64) (stable|ptb|canary|development)`;
await exec(usage, true, () => {
    const { channel, ...argv } = args(() => {
        const [nodeExecutable, script, platform, arch, channel] = process.argv;
        return { platform, arch, channel };
    });

    /**
     * @type {string}
     */
    const download = get(argv, get(argv, ARCH, "platform"), "arch");
    const [platform, arch] = download.split('/');

    const format = get(argv, FORMAT, "platform");

    return [
        async () => {
            const version = await json(`https://discord.com/api/updates/${channel}` + queryParams({ platform, arch, format: LINUX_FORMAT }));
            const response = await head(`https://${channel}.dl2.discordapp.net/apps/${platform}/${version.name}/${format(channel, version.name)}`);

            const uploadDate = response.headers.get('x-goog-generation') ?? '';
            let md5 = response.headers.get('x-goog-hash', '').match(/md5=([^,\s]+)/)?.[1];
            md5 = md5 ? Buffer.from(md5, "base64").toString("hex") : response.etag;

            return {
                download_uri: response.url, size: response.size, version: version.name,
                fingerprint: queryParams({ md5: md5, releaseDate: version.pub_date, upload: uploadDate }).slice(1)
            };
        },
        async () => {
            const response = await head(`https://discord.com/api/download/${channel}` + queryParams({ platform, arch, format: LINUX_FORMAT }));
            const version = response.url.match(/\/linux\/([\d.]+)\//)?.[1] ?? '';

            const uploadDate = response.headers.get('x-goog-generation') ?? '';
            let md5 = response.headers.get('x-goog-hash', '').match(/md5=([^,\s]+)/)?.[1];
            md5 = md5 ? Buffer.from(md5, "base64").toString("hex") : response.etag;

            return {
                download_uri: response.url, size: response.size, version,
                fingerprint: queryParams({ md5: md5, upload: uploadDate }).slice(1)
            };
        },
    ];
})
