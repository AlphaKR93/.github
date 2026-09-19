import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as actions from "@actions/core";


interface InputEntry {
  filename: string;
  url: string;
  path?: string;
}

interface ResolvedEntry {
  filename: string;
  url: string;
  sha256: string;
  size: number;
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Entry field "${field}" must be a non-empty string, got: ${JSON.stringify(value)}`);
  }
  return value;
}

function parseEntry(item: unknown, label: string): InputEntry {
  if (typeof item !== "object" || item === null) {
    throw new Error(`${label} must be an object`);
  }
  const record = item as Record<string, unknown>;

  const filename = assertNonEmptyString(record.filename, `${label}.filename`);
  const url = assertNonEmptyString(record.url, `${label}.url`);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`${label}.url is not a valid URL: ${url}`);
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error(`${label}.url must use http(s), got: ${parsedUrl.protocol}`);
  }
  const path = typeof record.path === "string" && record.path.length > 0 ? record.path : filename;

  return { filename, url, path };
}

function parseMain(raw: string): InputEntry | null {
  if (raw.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: any) {
    throw new Error(`Failed to parse "main" input as JSON: ${error.message}`);
  }
  return parseEntry(parsed, "main");
}

function parseExtra(raw: string): InputEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: any) {
    throw new Error(`Failed to parse "extra" input as JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`"extra" input must be a JSON array, got: ${typeof parsed}`);
  }

  return parsed.map((item, index) => parseEntry(item, `extra[${index}]`));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadTo(url: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status} ${response.statusText}`);
  }
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(path));
}

async function hashFile(path: string): Promise<{ sha256: string; size: number }> {
  const hash = createHash("sha256");
  const { size } = await stat(path);
  await pipeline(createReadStream(path), hash);
  return { sha256: hash.digest("hex"), size };
}

async function resolveEntry(entry: InputEntry): Promise<ResolvedEntry> {
  const path = entry.path as string; // always set by parseEntry
  if (await fileExists(path)) {
    actions.info(`Using already-downloaded file for "${entry.filename}": ${path}`);
  } else {
    actions.info(`Downloading "${entry.filename}" from ${entry.url} to ${path}`);
    await downloadTo(entry.url, path);
  }

  const { sha256, size } = await hashFile(path);
  actions.info(`Resolved "${entry.filename}": size=${size}, sha256=${sha256}`);
  return { filename: entry.filename, url: entry.url, sha256, size };
}

async function main() {
  const mainEntry = parseMain(actions.getInput("main"));
  const extra = parseExtra(actions.getInput("extra"));
  const entries = mainEntry ? [mainEntry, ...extra] : extra;

  const resolved: ResolvedEntry[] = [];
  for (const entry of entries) {
    resolved.push(await resolveEntry(entry));
  }

  actions.setOutput("entries", JSON.stringify(resolved));
}

export default main;
