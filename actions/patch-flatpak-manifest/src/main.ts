import { readFile, writeFile } from "node:fs/promises";
import * as actions from "@actions/core";
import { Document, isMap, isSeq, parseDocument, YAMLMap } from "yaml";


interface ExtraDataEntry {
  filename: string;
  url: string;
  sha256: string;
  size: number;
}

const SHA256_RE = /^[0-9a-f]{64}$/;

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Entry field "${field}" must be a non-empty string, got: ${JSON.stringify(value)}`);
  }
  return value;
}

function parseEntries(raw: string): ExtraDataEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: any) {
    throw new Error(`Failed to parse "entries" input as JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`"entries" input must be a JSON array, got: ${typeof parsed}`);
  }

  return parsed.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`entries[${index}] must be an object`);
    }
    const record = item as Record<string, unknown>;

    const filename = assertNonEmptyString(record.filename, `entries[${index}].filename`);
    const url = assertNonEmptyString(record.url, `entries[${index}].url`);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`entries[${index}].url is not a valid URL: ${url}`);
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new Error(`entries[${index}].url must use http(s), got: ${parsedUrl.protocol}`);
    }

    const sha256 = assertNonEmptyString(record.sha256, `entries[${index}].sha256`).toLowerCase();
    if (!SHA256_RE.test(sha256)) {
      throw new Error(`entries[${index}].sha256 must be 64 lowercase hex characters, got: ${sha256}`);
    }

    const size = typeof record.size === "string" ? Number(record.size) : record.size;
    if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
      throw new Error(`entries[${index}].size must be a positive integer, got: ${JSON.stringify(record.size)}`);
    }

    return { filename, url, sha256, size };
  });
}

/**
 * Finds every `type: extra-data` source across all modules of the manifest document,
 * keyed by its `filename` field.
 */
function findExtraDataSources(doc: Document): Map<string, YAMLMap[]> {
  const byFilename = new Map<string, YAMLMap[]>();
  const modules = doc.get("modules", true);
  if (!isSeq(modules)) {
    throw new Error('Manifest has no top-level "modules" sequence');
  }

  for (const module of modules.items) {
    if (!isMap(module)) continue;
    const sources = module.get("sources", true);
    if (!isSeq(sources)) continue;

    for (const source of sources.items) {
      if (!isMap(source)) continue;
      if (source.get("type") !== "extra-data") continue;

      const filename = source.get("filename");
      if (typeof filename !== "string" || filename.length === 0) continue;

      const list = byFilename.get(filename) ?? [];
      list.push(source);
      byFilename.set(filename, list);
    }
  }

  return byFilename;
}

async function main() {
  const manifestPath = actions.getInput("manifest", { required: true });
  const outputPath = actions.getInput("output", { required: true });
  const entries = parseEntries(actions.getInput("entries", { required: true }));

  actions.info(`Loading manifest from ${manifestPath}`);
  const source = await readFile(manifestPath, "utf8");
  const doc = parseDocument(source, { keepSourceTokens: false });
  if (doc.errors.length > 0) {
    throw new Error(`Failed to parse manifest YAML:\n${doc.errors.join("\n")}`);
  }

  const extraDataSources = findExtraDataSources(doc);

  for (const entry of entries) {
    const matches = extraDataSources.get(entry.filename);
    if (!matches || matches.length === 0) {
      throw new Error(
        `No "type: extra-data" source with filename "${entry.filename}" was found in ${manifestPath}`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Found ${matches.length} "type: extra-data" sources with filename "${entry.filename}" in ${manifestPath}; expected exactly one`,
      );
    }

    const [source] = matches;
    source.set("url", entry.url);
    source.set("sha256", entry.sha256);
    source.set("size", entry.size);
    actions.info(`Patched extra-data source "${entry.filename}": size=${entry.size}, sha256=${entry.sha256}`);
  }

  await writeFile(outputPath, doc.toString(), "utf8");
  actions.info(`Wrote patched manifest to ${outputPath}`);
  actions.setOutput("manifest", outputPath);
}

export default main;
