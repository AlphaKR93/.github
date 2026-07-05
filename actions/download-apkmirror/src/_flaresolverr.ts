import { warning } from "@actions/core";
import type { FlareSolverrRequest, FlareSolverrRequests, ResponseOf } from "flaresolverr";


async function flareSolverr<T extends FlareSolverrRequest>(
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

export async function get(session: Session, url: string, maxRetries: number = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const data = await flareSolverr({ cmd: "request.get", url });

    if (data.status === "ok") {
      session.cookies = (data.solution?.cookies ?? []).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
      session.userAgent = data.solution?.userAgent ?? session.userAgent;
      return data.solution;
    }

    warning(`[!] FlareSolverr attempt ${attempt}/${maxRetries} failed: ${url}`);
    await sleep(10_000);
  }

  throw new Error(`FlareSolverr failed after ${maxRetries} attempts: ${url}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
