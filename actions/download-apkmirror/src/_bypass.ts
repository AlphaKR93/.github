import { info, warning, debug } from "@actions/core";
import type { ChallengeResolutionResult, FlareSolverrRequest, FlareSolverrRequests, ResponseOf } from "flaresolverr";


async function _flareSolverr<T extends FlareSolverrRequest>(
  data: FlareSolverrRequests & T,
  requestOptions?: { url?: string; }
): Promise<ResponseOf<T>> {
  const { url = "http://localhost:8191/v1" } = requestOptions ?? {};
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  return (await response.json()) as ResponseOf<T>;
}

async function flareSolverr(session: Session, url: string, maxRetries: number = 5): Promise<ChallengeResolutionResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const data = await _flareSolverr({ cmd: "request.get", url });

    if (data.status === "ok" && !data.solution?.response?.includes("<title>Just a moment...</title>")) {
      info(`[+] FlareSolverr succeeded: ${data.solution?.status}`);
      debug(data.solution?.response ?? "null");
      session.cookies = (data.solution?.cookies ?? []).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
      session.userAgent = data.solution?.userAgent ?? session.userAgent;
      return data.solution;
    }

    warning(`[!] FlareSolverr attempt ${attempt}/${maxRetries} failed: ${url}`);
    await sleep(10_000);
  }

  throw new Error(`FlareSolverr failed after ${maxRetries} attempts: ${url}`);
}

async function cfBypass(session: Session, url: string, maxRetries: number = 5): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const data = await fetch(`http://localhost:8000/html?url=${encodeURI(url)}`);

    if (data.ok) {
      const text = await data.text();
      info(`[+] Cloudflare bypass succeeded: ${data.headers.keys()}`);
      debug(text);
      session.cookies = data.headers.get("x-cf-bypasser-cookies")!;
      session.userAgent = data.headers.get("x-cf-bypasser-user-agent")!;
      return text;
    }

    warning(`[!] Cloudflare bypass attempt ${attempt}/${maxRetries} failed: ${url}`);
    await sleep(10_000);
  }

  throw new Error(`Cloudflare bypass failed after ${maxRetries} attempts: ${url}`);
}

export async function get(session: Session, url: string, maxRetries: number = 5): Promise<string> {
  try {
    return (await flareSolverr(session, url, maxRetries)).response!;
  } catch (error) {
    warning(`[!] FlareSolverr failed: ${error}`);
    return await cfBypass(session, url, maxRetries);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
