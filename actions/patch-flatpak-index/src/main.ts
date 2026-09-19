import { access, readFile, writeFile } from "node:fs/promises";
import * as actions from "@actions/core";
import { isMap, parseDocument } from "yaml";


async function readExisting(path: string): Promise<string> {
  try {
    await access(path);
  } catch {
    return "";
  }
  return readFile(path, "utf8");
}

async function main() {
  const filePath = actions.getInput("file", { required: true });
  const key = actions.getInput("key", { required: true });
  const value = actions.getInput("value", { required: true });

  if (key.length === 0) {
    throw new Error('"key" input must not be empty');
  }

  const source = await readExisting(filePath);
  const doc = parseDocument(source);
  if (doc.errors.length > 0) {
    throw new Error(`Failed to parse ${filePath} as YAML:\n${doc.errors.join("\n")}`);
  }

  if (doc.contents == null || !isMap(doc.contents)) {
    // `doc` was produced by `parseDocument`, which types `contents` as a "Parsed" node;
    // a freshly created node is structurally identical but lacks source-position metadata.
    doc.contents = doc.createNode({}) as any;
  }

  actions.info(`Setting "${key}" in ${filePath}`);
  doc.set(key, value);

  await writeFile(filePath, doc.toString(), "utf8");
  actions.setOutput("file", filePath);
}

export default main;
