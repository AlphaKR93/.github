import * as actions from "@actions/core";
import * as github from "@actions/github";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";


type ActionsOctokit = ReturnType<typeof github.getOctokit>;

/**
 * Utility function to try creating a {@link RegExp} from a string, or return `null` if it fails.
 *
 * @param from The string to try creating a RegExp from.
 */
function tryCreateRegEx(from: string): RegExp | null {
  try {
    return new RegExp(from);
  } catch (error) {
    return null;
  }
}

async function getReleaseDate(
  octokit: ActionsOctokit,
  repository: string | { owner: string; repo: string; },
  file: string,
  filter?: (release: RestEndpointMethodTypes["repos"]["getRelease"]["response"]["data"]) => boolean,
): Promise<number> {
  const [owner, repo] = typeof repository === "string" ? repository.split("/", 2) : [repository.owner, repository.repo];
  const response = await octokit.rest.repos.listReleases({owner, repo});
  const regex = tryCreateRegEx(file);

  const matches = response.data.filter((release) =>
    (Boolean(release.assets.length) && release.assets.some((asset) => asset.name === file || regex?.test(asset.name)))
    && (!filter || filter?.(release))
  );
  if (!matches.length) {
    throw new Error(`No matching release(s) found for repository: https://github.com/${owner}/${repo}`);
  } else {
    actions.info(`Found ${matches.length} release(s) from repository: https://github.com/${owner}/${repo}`);
  }

  actions.info("");
  actions.info(`Using the latest ${matches[0].prerelease ? "pre" : ""}release: `
    + `${matches[0].name || matches[0].tag_name} (${matches[0].tag_name})`);
  actions.info(`- URL: ${matches[0].html_url}`);

  const date = Date.parse(matches[0].updated_at || matches[0].created_at);
  actions.info(`- Released/Updated at: ${(new Date(date)).toISOString()}`);
  actions.info("");

  return date;
}

/**
 * Special functions to fetch the current release date.
 * This is required because {@link getReleaseDate} will fail if new target is added.
 */
async function getCurrentReleaseDate(octokit: ActionsOctokit) {
  const marker = actions.getInput("release-file", { required: true });

  try {
    return await getReleaseDate(octokit, github.context.repo, marker);
  } catch (error) {
    (actions.warning as any)(error);
    return 0;
  }
}

async function main() {
  const repo = actions.getInput("repository", { required: true });
  const file = actions.getInput("target-file", { required: true });

  const tagName = actions.getInput("tag-name");
  const prerelease = actions.getBooleanInput("pre-release");

  const octokit = github.getOctokit(actions.getInput("token", { required: true }));
  const current = await getCurrentReleaseDate(octokit);
  const latest = await getReleaseDate(octokit, repo, file, (release) =>
    (!tagName || (release.tag_name === tagName))
    && (prerelease || !release.prerelease));

  actions.setOutput("current", current);
  actions.info(`Current: ${new Date(current).toISOString()}`);
  actions.setOutput("latest", latest);
  actions.info(`Latest: ${new Date(latest).toISOString()}`);

  const isUpdated = latest > current;
  actions.setOutput("result", isUpdated);
  if (isUpdated) actions.info("Update available");
  else actions.info("No update available");
}
export default main;
