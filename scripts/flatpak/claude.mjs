#!/usr/bin/env node
import { exec, text } from "./lib/index.mjs";

const REPOSITORY = "https://downloads.claude.ai/claude-desktop/apt/stable";
const PACKAGES = `${REPOSITORY}/dists/stable/main/binary-amd64/Packages`;

function parsePackages(contents) {
    return contents.trim().split(/\n\n+/).map((paragraph) => {
        const fields = {};
        let key = "";
        for (const line of paragraph.split("\n")) {
            if (line.startsWith(" ")) {
                fields[key] = `${fields[key] ?? ""}\n${line.slice(1)}`;
                continue;
            }
            const separator = line.indexOf(":");
            if (separator === -1) continue;
            key = line.slice(0, separator);
            fields[key] = line.slice(separator + 1).trim();
        }
        return fields;
    });
}

function compareVersions(left, right) {
    return left.localeCompare(right, undefined, { numeric: true });
}

function latestPackage(packages) {
    const candidates = packages.filter((entry) =>
        entry.Package === "claude-desktop" && entry.Architecture === "amd64"
    );
    if (candidates.length === 0) {
        throw new Error("The Anthropic APT index contains no amd64 claude-desktop package");
    }
    return candidates.reduce((latest, entry) =>
        compareVersions(entry.Version, latest.Version) > 0 ? entry : latest
    );
}

function packageInfo(entry) {
    const { Filename: filename, SHA256: sha256, Size: size, Version: version } = entry;
    if (!filename || filename.startsWith("/") || filename.includes("..")) {
        throw new Error(`Invalid Claude Desktop package filename: ${filename}`);
    }
    if (!/^[0-9a-f]{64}$/.test(sha256 ?? "")) {
        throw new Error(`Invalid Claude Desktop SHA-256: ${sha256}`);
    }
    if (!/^[1-9][0-9]*$/.test(size ?? "")) {
        throw new Error(`Invalid Claude Desktop package size: ${size}`);
    }
    if (!version) throw new Error("Claude Desktop package has no version");

    return {
        download_uri: `${REPOSITORY}/${filename}`,
        fingerprint: sha256,
        version,
    };
}

await exec("", true, () => [
    async () => packageInfo(latestPackage(parsePackages(await text(PACKAGES)))),
]);
