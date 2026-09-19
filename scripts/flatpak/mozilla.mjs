#!/usr/bin/env node
import { args, exec, get, head, json, queryParams, text } from "./lib/index.mjs";

const argv = args(() => {
    const [nodeExecutable, script, product, channel, os, arch, lang] = process.argv;
    return { product, channel, os, arch, lang };
});

const BOUNCER_PRODUCTS = {
    firefox: {
        esr: "FIREFOX_ESR",
        esr115: "FIREFOX_ESR115",
        esr_next: "FIREFOX_ESR_NEXT",
        latest: "LATEST_FIREFOX_VERSION",
        beta: "FIREFOX_DEVEDITION",
        nightly: "FIREFOX_NIGHTLY"
    },
    thunderbird: {
        esr: "THUNDERBIRD_ESR",
        esr_next: "THUNDERBIRD_ESR_NEXT",
        latest: "LATEST_THUNDERBIRD_VERSION",
        beta: "LATEST_THUNDERBIRD_DEVEL_VERSION",
        nightly: "LATEST_THUNDERBIRD_NIGHTLY_VERSION",
    },
};
const PLATFORM = {
    windows: { x86: "win32", amd64: "win64", arm64: null },
    mac: { x86: null, amd64: "mac", arm64: null },
    linux: { x86: null, amd64: "linux-x86_64", arm64: null },
}

/**
 * @param {string} product
 * @param {string} version
 * @param {string} release
 * @returns {Promise<[string, string]>}
 */
async function retrieveVersionInfo(product, version, release) {
    const archive = `https://archive.mozilla.org/pub/${product}/releases/${version}`;
    const sums = await text(`${archive}/SHA256SUMS`);
    const line = sums.split('\n').find((l) => l.trim().endsWith(`  ${release}`));
    if (!line)
        throw new Error(`Cannot find ${release} in SHA256SUMS`);
    return [`${archive}/${release}`, line.split(/\s+/)[0]];
}

const usage = `\
(firefox|thunderbird) [channel] (windows|mac|linux) (x86|amd64|arm64) [lang]`;
await exec(usage, true, () => {
    const versionKey = get(argv, get(argv, BOUNCER_PRODUCTS, "product"), "channel");
    if (!versionKey)
        throw new UsageError(`Invalid channel: ${argv.channel}`);

    const os = get(argv, get(argv, PLATFORM, "os"), "arch");

    return [
        async () => {
            const version = (await json(`https://product-details.mozilla.org/1.0/${argv.product}_versions.json`))[versionKey];

            const release = `${os}/${argv.lang}/${argv.product}-${version}.tar.xz`;
            const [download_uri, sha256] = await retrieveVersionInfo(argv.product, version, release);
            const { size } = await head(download_uri);

            return { version, size, download_uri, sha256, fingerprint: sha256 };
        },
        async () => {
            const response = await head(`https://download.mozilla.org/` + queryParams({
                product: `${args.product}-latest-ssl`,
                os: os === 'linux-x86_64' ? 'linux64' : os,
                lang: argv.lang,
            }));

            const version = response.url.match(/\/releases\/([^/]+)\//)?.[1];
            if (!version)
                throw new Error("Cannot extract versions from bouncer");

            const release = response.url.split(`/releases/${v}/`)[1];
            const [_, sha256] = await retrieveVersionInfo(argv.product, version, release);
            return { version, size: h.size, download_uri: `${ARCHIVE}/${v}/${rel}`, sha256, fingerprint: sha256 };
        }
    ];
});
