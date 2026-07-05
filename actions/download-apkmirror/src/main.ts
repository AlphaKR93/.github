import * as actions from "@actions/core";
import { getExecOutput } from "@actions/exec";
import { load, type CheerioAPI } from "cheerio";

import { ApkMirror } from "./provider";
import { get } from "./_flaresolverr";


const DPI_FALLBACK = ["120-640dpi", "120-480dpi", "480-640dpi", "480dpi"];

// --- version helpers ---------------------------------------------------------

const VERSION = /(?:0\.\d+|[1-9]\d*)(?:\.0[1-9]?|\.[1-9]\d*)*/;
function compareVersions(a: string, b: string): number {
  const pa = VERSION.exec(a)?.[0]?.split(".")?.map(Number)!;
  const pb = VERSION.exec(b)?.[0]?.split(".")?.map(Number)!;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

const filterExact = (version: string) => (
  ({ text }: { text: string; } & any) => text.includes(` ${version} `) || text.endsWith(` ${version}`)
);

// --- HTML extraction helpers -------------------------------------------------

function extractAppRowLinks(application: ApkMirror, html: string | CheerioAPI): { text: string; href: string }[] {
  const $ = typeof html === "string" ? load(html) : html;
  const links = $("h5.appRowTitle a.fontBlack")
    .map((_, el) => ({ text: $(el).text(), href: $(el).attr("href") ?? "" }))
    .get();
  return links.filter((l) => l.href.startsWith(application.versionHrefPrefix));
}

function extractHrefs(html: string, selector: string): string[] {
  const $ = load(html);
  return $(selector)
    .map((_, el) => $(el).attr("href") ?? "")
    .get()
    .filter(Boolean);
}

// --- get_apk -----------------------------------------------------------------

async function main() {
  if (ApkMirror.BASE_URL.endsWith('/'))
    throw new Error("`base-url` must not be end with '/'");

  const application = new ApkMirror(
    actions.getInput("publisher-id", { required: true }),
    actions.getInput("app-category", { required: true }),
    actions.getInput("template"),
  );

  const apkName = actions.getInput("apk-name", { required: true });
  const typeBadge = actions.getBooleanInput("bundle") ? "BUNDLE" : "APK";
  const arch = actions.getInput("arch").toLowerCase();
  const dpi = actions.getInput("dpi").toLowerCase();
  const minSdk = actions.getInput("min-sdk").toLowerCase();
  actions.info(`[+] Downloading ${apkName} (type=${typeBadge} arch=${arch} dpi=${dpi} minSdk=${minSdk})`);

  const session: Session = { cookies: "", userAgent: "" };
  const [versionHref, isFromTemplate] = await (async () => {
    const version = actions.getInput("version");
    if (version && application.hasVersionTemplate) {
      const templateUrl = application.buildVersionPageUrl(version);
      actions.info(`Using provided template with version ${version}: ${templateUrl}`);
      return [templateUrl, true];
    }

    const except = (() => {
      const versionExcepts = actions.getInput("version-excepts");
      return (!versionExcepts || !versionExcepts.split('|').length) ? null : new RegExp(versionExcepts, "i");
    })();

    if (actions.getBooleanInput("unsafe-dangerouslyUseLatestVersionFromApkMirror")) {
      const extractor = new RegExp(actions.getInput("version-regex", { required: true }));

      actions.info(`Retrieving latest version from ApkMirror: ${application.listUrl}`);
      const response = await get(session, application.listUrl);

      const latest = extractAppRowLinks(application, response.response!)
        .filter(({ href }) => href.startsWith(application.versionHrefPrefix))
        .filter(({ text }) => !except?.test(text) && extractor.test(text))
        .map((l) => ({ version: extractor.exec(l.text)?.[0]!, href: l.href }))
        .sort((b, a) => compareVersions(a!.version, b!.version));

      if (!latest.length) throw new Error("Could not find latest version on APKMirror");
      return [ApkMirror.BASE_URL + latest[0]!.href, false];
    } else if (!version)
      throw new Error("`version` must be set unless it is fetched from ApkMirror");

    actions.info(`Retrieving version template from ApkMirror: ${application.listUrl}`);
    const response = await get(session, application.listUrl);
    const links = extractAppRowLinks(application, response.response!);

    const exact = links.find(filterExact(version));
    if (exact) return [ApkMirror.BASE_URL + exact.href, false];

    const href = links.find(({text}) => !except?.test(text))?.href ?? links[0]?.href ?? null;

    // TODO: Cleanup this
    const slugMatches = [...href.matchAll(/\d+(?:-\d+)+/g)];
    const targetMatch = version.replace(/\./g, "-").match(/\d+(?:-\d+)+/);
    if (slugMatches.length === 0 || !targetMatch) return [ApkMirror.BASE_URL + href, true];
    return [ApkMirror.BASE_URL + href.replace(slugMatches[slugMatches.length - 1][0], targetMatch[0]), true];
  })();
  const fetched = Boolean(session.userAgent);

  const versionPage: string = await (async () => {
    const retrieveVersionPage = async (session: Session, href: string) => {
      actions.info(`- ${href}`);

      const response = await get(session, href);
      const html = response.response;

      if (html && response.status === 200 && !html.includes("Not Found") && !html.includes("404 Whoops"))
        return html;
      else
        return null;
    };

    let html = await retrieveVersionPage(session, versionHref);
    if (html) return html;
    if (!isFromTemplate) throw new Error("Could not find version on APKMirror");

    actions.warning("Version page not found, searching uploads pages...");

    const version = actions.getInput("version");
    if (!version) throw new Error("`version` must be set unless it is fetched from ApkMirror");

    const [host, query] = application.listUrl.split("?");
    const filter = filterExact(version);

    let href: string | undefined;
    let pageNum = 1;
    let lastPage: number | undefined;
    while (pageNum++ <= 10 && ((!lastPage && pageNum <= 2) || pageNum <= lastPage!)) {
      if (fetched && pageNum === 1) continue; // Skip page 1 since we already searched via getVersionHref

      const response = await get(session, pageNum === 1 ? application.listUrl : `${host}/page/${pageNum}/?${query}`);
      let content: string | CheerioAPI = response.response!;

      if (!lastPage) {
        if (pageNum > 2) throw new Error("Last page number not set");

        const $ = content = load(content);
        const page = $("div.pagination div.wp-pagenavi span.pages").first().text().match(/^Page \d+ of (\d+)$/);
        if (!page) throw new Error("Could not find last page number");
        lastPage = Number(page[0]);
      }

      href = extractAppRowLinks(application, content).find(filter)?.href;
      if (href) break;
    }

    if (href) html = await retrieveVersionPage(session, ApkMirror.BASE_URL + href);
    if (!html) throw new Error("Could not find version on APKMirror");
    return html;
  })();

  const variantRows: string[] = (() => {
    const $ = load(versionPage);
    const table = $("div.variants-table").first();
    return table.length ? ($.html(table) as string) : "";
  })().replace(/\n/g, " ").split(/(?=<div class="table-row)/);

  const decodeAmp = (html: string) => html.replace(/&amp;/g, "&");

  const [variantHref, matchedType] = (() => {
    let variantHref = "";
    let matchedType = "";
    for (const tryType of typeBadge === "BUNDLE" ? ["BUNDLE", "APK"] : ["APK", "BUNDLE"]) {
      let filteredRows = variantRows.filter((r) => new RegExp(`apkm-badge[^>]*>\\s*${tryType}\\s*<`, "i").test(r));

      if (arch)
        filteredRows = filteredRows.filter((r) => r.toLowerCase().includes(arch));

      if (minSdk)
        filteredRows = filteredRows.filter((r) => r.toLowerCase().includes(minSdk));

      if (dpi) {
        let dpiFiltered = filteredRows.filter((r) => r.toLowerCase().includes(dpi));
        if (dpiFiltered.length === 0) for (const fbDpi of DPI_FALLBACK) {
          dpiFiltered = filteredRows.filter((r) => r.toLowerCase().includes(fbDpi));
          if (dpiFiltered.length > 0) {
            actions.warning(`No matching DPI found, falling back: ${dpi} -> ${fbDpi}`);
            break;
          }
        }
        filteredRows = dpiFiltered;
      }

      const match = filteredRows.join(" ").match(/accent_color[^>]*href="([^"]+)"/);
      if (match) {
        variantHref = decodeAmp(ApkMirror.BASE_URL + match[1]);
        matchedType = tryType;
        if (tryType !== typeBadge) actions.warning(`[!] Type fallback: ${typeBadge} -> ${tryType}`);
        break;
      }
    }

    if (!variantHref) throw new Error(`Could not find variant`);

    variantHref = decodeAmp(variantHref);
    return [variantHref, matchedType];
  })();

  const apkFile = matchedType === "BUNDLE" ? `${apkName}.apkm` : `${apkName}.apk`;

  const downloadHref = await (async () => {
    actions.info(`- ${variantHref}`);
    let response = await get(session, variantHref);

    const allDlBtns = extractHrefs(response.response!, "a.downloadButton");
    const dlBtnHref = matchedType === "BUNDLE"
      ? allDlBtns.find((h) => !h.includes("forcebaseapk")) ?? allDlBtns[0]
      : allDlBtns.find((h) => h.includes("forcebaseapk")) ?? allDlBtns[0];

    if (!dlBtnHref)
      throw new Error("Could not find download button");
    return ApkMirror.BASE_URL + dlBtnHref;
  })();

  const finalHref = await (async () => {
    actions.info(`- ${downloadHref}`);
    const response = await get(session, downloadHref);

    const finalHref = decodeAmp(extractHrefs(response.response!, "a#download-link")[0] ?? "");
    if (!finalHref)
      throw new Error("Could not find final download URL");
    return ApkMirror.BASE_URL + finalHref;
  })();

  actions.info(`Extracted download URL: ${finalHref}`);

  try {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    let turnstileRetries = 0;
    const TURNSTILE_MAX_RETRIES = 99;
    async function checkTurnstileToken() {
      if (session.cookies.includes("cf_clearance")) return;

      actions.warning("Turnstile token not generated, generating new one...");
      actions.startGroup("Turnstile token generation");
      let fs = await get(session, versionHref);
      while (!fs.cookies?.some((c) => c.name === "cf_clearance")) {
        actions.debug(fs.response ?? "null");
        actions.debug("");
        if (turnstileRetries > TURNSTILE_MAX_RETRIES)
          throw new Error("Turnstile token generation failed");
        actions.info(`Retrying to generate... (${(turnstileRetries++).toString().padStart(2, '0')}/${TURNSTILE_MAX_RETRIES}): ${fs.cookies?.map((c) => c.name).join(", ") ?? "none"}`);
        //await sleep(10_000);
        fs = await get(session, versionHref);
      }
      actions.endGroup();
      actions.info("[+] Token generated!");
      await sleep(10_000);
    }

    let retries = 1;
    const DOWNLOAD_MAX_RETRIES = 5;
    async function downloadFile(url: string, destPath: string, headers: Record<string, string>): Promise<void> {
      const { dirname } = await import("node:path");
      const { mkdir } = await import("node:fs/promises");
      const { createWriteStream } = await import("node:fs");
      const { pipeline } = await import("node:stream/promises");
      const { Readable } = await import("node:stream");

      actions.info(`Trying to download ${destPath} from: ${url}`)
      const res = await fetch(url, { headers });
      if (res.ok && res.body) {
        actions.info(`[+] Writing file: ${destPath}`);
        await mkdir(dirname(destPath), { recursive: true });
        await pipeline(Readable.fromWeb(res.body as any), createWriteStream(destPath));
        return;
      }

      if (retries >= DOWNLOAD_MAX_RETRIES)
        throw new Error(`Download failed ${retries}/${DOWNLOAD_MAX_RETRIES} (${res.status} ${res.statusText}): ${url}`);

      const content = await res.text();
      actions.info(`[-] Download failed ${retries++}/${DOWNLOAD_MAX_RETRIES} (${res.status} ${res.statusText}): ${url}`);
      if (actions.isDebug()) {
        actions.startGroup("HTML Response");
        actions.debug(content);
        actions.endGroup();
      }
      if (res.status === 403 && content.includes("<title>Just a moment...</title>"))
        await checkTurnstileToken();
      else
        await sleep(10_000);

      return await downloadFile(url, destPath, {
        "User-Agent": session.userAgent,
        Referer: downloadHref,
        Cookie: session.cookies,
      });
    }

    actions.info(`[+] Downloading ${apkFile} from: ${finalHref}`);
    await downloadFile(finalHref, `./download/${apkFile}`, {
      "User-Agent": session.userAgent,
      Referer: downloadHref,
      Cookie: session.cookies,
    });
    // await getExecOutput("aria2c", [
    //   `--out=./download/${apkFile}`,
    //   `--header="User-Agent: ${session.userAgent}"`,
    //   `--header="Cookie: ${session.cookies}"`,
    //   `--header="Referer: ${downloadHref}"`,
    //   `--user-agent="${session.userAgent}"`,
    //   `--referer="${downloadHref}"`,
    //   finalHref,
    // ]);

    actions.info(`[+] Successfully downloaded ${apkName}`);
    actions.setOutput("file", `./download/${apkFile}`);
    if (matchedType !== "BUNDLE") return;

    // input.bundle: true
    if (typeBadge === "BUNDLE") {
      actions.setOutput("file", `./download/${apkName}`);
      await getExecOutput("unzip", ["-o", `./download/${apkFile}`, "-d", `./download/${apkName}`]);
      return;
    }

    actions.setOutput("bundle", true);
    // actions.info("[+] Merge splits apk to standalone apk");
    // await getExecOutput("java", [
    //   "-jar",
    //   "./APKEditor.jar",
    //   "m",
    //   "-i",
    //   `./download/${apkName}.apkm`,
    //   "-o",
    //   `./download/${apkName}.apk`,
    // ]);
  } catch (err) {
    actions.error(`[-] Failed to download ${apkName}`);
    throw err;
  }
}

ApkMirror.BASE_URL = actions.getInput("base-url", { required: true }) as "https://www.apkmirror.com";
export default main;
