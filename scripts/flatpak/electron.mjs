#!/usr/bin/env node
import { text, head, args, queryParams, exec } from './lib/index.mjs';

/**
 *
 * @param {string} yaml
 * @returns {{ version: string; releaseDate: string; files: { url: string; sha512: string; size: string }[] }}
 */
// TODO: Use https://api.alpha93.kr/tools/io/texts/convert/yaml/json
function parseVersionYaml(yaml) {
    const out = { files: [] };
    let cur = null;
    for (const line of yaml.split(/\r?\n/)) {
        let m;
        if ((m = line.match(/^version:\s*'?([^']+?)'?\s*$/))) out.version = m[1];
        else if ((m = line.match(/^path:\s*(.+)$/))) out.path = m[1].trim();
        else if ((m = line.match(/^sha512:\s*(.+)$/))) out.sha512 = m[1].trim();
        else if ((m = line.match(/^\s+-\s+url:\s*(.+)$/))) { cur = { url: m[1].trim() }; out.files.push(cur); }
        else if (cur && (m = line.match(/^\s+(sha512|size|blockMapSize):\s*(.+)$/))) cur[m[1]] = m[2].trim();
    }
    return out;
}

const VERSION_MATCH = /^.*-(\d+(?:\.\d+)+)(?:-.*)*\.AppImage$/;
await exec(`<feed-url> <fallback>`, true, () => {
    const { feed, fallback } = args(() => {
        const [nodeExecutable, script, feed, fallback] = process.argv;
        return { feed, fallback };
    })

    return [
        async () => {
            const response = await text(feed);
            const yaml = parseVersionYaml(response);
            const file = yaml.files.find((x) => VERSION_MATCH.test(x.url));
            if (!file)
                throw new Error(`Cannot retrieve file from ${yaml}\n${response}`);

            const download_uri = new URL(file.url, feed).href; // handles relative path
            const fingerprint = Buffer.from(file.sha512, "base64").toString("hex");
            const size = file.size ?? (await head(download_uri)).size;
            return { download_uri, size, version: yaml.version, fingerprint };
        },
        async () => {
            const response = await head(fallback);
            const version = response.url.match(VERSION_MATCH)?.[1] ?? '';
            return { download_uri: response.url, size: response.size, version,
                     fingerprint: queryParams({ version, size: response.size, etag: response.etag }).slice(1) };
        }
    ]
});
