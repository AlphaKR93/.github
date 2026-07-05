interface LinkedType<
  This extends LinkedType<This, That>,
  That extends LinkedType<That, This>
> extends This {
  "$linkedType": That;
}

interface FlareSolverrBaseResponse {
  version: string;
  startTimestamp: number;
  endTimestamp: number;

  status: "ok" | "error";
  message: string;
}

export interface FlareSolverrErrorResponse extends FlareSolverrBaseResponse {
  status: "error";
}

interface FlareSolverrBaseSuccessResponse<
  Request extends FlareSolverrBaseRequest<Response, Request>,
  Response extends FlareSolverrBaseSuccessResponse<Response, Request>,
> extends FlareSolverrBaseResponse, LinkedType<Response, Request> {
  status: "ok";
}

interface FlareSolverrBaseRequest<
  Request extends FlareSolverrBaseRequest<Request, Response>,
  Response extends FlareSolverrBaseSuccessResponse<Request, Response>,
> extends LinkedType<Request, Response> {
  cmd: string;
}

export interface Proxy {
  url: `http://${string}` | `https://${string}` | `socks4://${string}` | `socks5://${string}`;
  username?: string;
  password?: string;
}

/**
 * This will launch a new browser instance which will retain cookies until you
 * destroy it with sessions.destroy. This comes in handy, so you don't have to
 * keep solving challenges over and over and you won't need to keep sending
 * cookies for the browser to use.
 *
 * This also speeds up the requests since it won't have to launch a new browser
 * instance for every request.
 */
interface FlareSolverrCreateSessionRequest extends FlareSolverrBaseRequest<FlareSolverrCreateSessionRequest, FlareSolverrCreateSessionResponse> {
  cmd: "sessions.create";

  /**
   * The session ID that you want to be assigned to the instance.
   * If isn't set a random UUID will be assigned.
   */
  session?: string;
  proxy?: Proxy;
}

interface FlareSolverrCreateSessionResponse extends FlareSolverrBaseSuccessResponse<FlareSolverrCreateSessionRequest, FlareSolverrCreateSessionResponse> {
  session: string;
}

/**
 * Returns a list of all the active sessions. More for debugging if you are
 * curious to see how many sessions are running. You should always make sure to
 * properly close each session when you are done using them as too many may slow
 * your computer down.
 */
interface FlareSolverrListSessionRequest extends FlareSolverrBaseRequest<FlareSolverrListSessionRequest, FlareSolverrListSessionResponse> {
  cmd: "sessions.list";
}

interface FlareSolverrListSessionResponse extends FlareSolverrBaseSuccessResponse<FlareSolverrListSessionRequest, FlareSolverrListSessionResponse> {
  sessions: string[];
}

/**
 * This will properly shutdown a browser instance and remove all files
 * associated with it to free up resources for a new session. When you no longer
 * need to use a session you should make sure to close it.
 */
interface FlareSolverrDestroySessionRequest extends FlareSolverrBaseRequest<FlareSolverrDestroySessionRequest, FlareSolverrDestroySessionResponse> {
  cmd: "sessions.destroy";

  /**
   * The session ID that you want to be destroyed.
   */
  session: string;
}

interface FlareSolverrDestroySessionResponse extends FlareSolverrBaseSuccessResponse<FlareSolverrDestroySessionRequest, FlareSolverrDestroySessionResponse> {
}

interface FlareSolverrBaseWebRequest<
  Request extends FlareSolverrBaseWebRequest<Request, Response>,
  Response extends FlareSolverrBaseWebResponse<Request, Response>
> extends FlareSolverrBaseRequest<Request, Response> {
  url: string;

  /**
   * Will send the request from and existing browser instance. If one is not
   * sent it will create a temporary instance that will be destroyed immediately
   * after the request is completed.
   */
  session?: string;

  /**
   * FlareSolverr will automatically rotate expired sessions based on the TTL
   * provided in minutes.
   */
  session_ttl_minutes?: number;

  /**
   * Max timeout to solve the challenge in milliseconds. Default to `60_000`.
   */
  maxTimeout?: number;

  /**
   * Will be used by the headless browser.
   */
  cookies?: {
    name: string;
    value: string;
  }[];

  /**
   * Only returns the cookies. Response data, headers, and other parts of the
   * response are removed. Defaults to `false`.
   */
  returnOnlyCookies?: boolean;

  /**
   * Captures a screenshot of the final rendered page after all challenges and
   * waits are completed. The screenshot is returned as a Base64-encoded PNG
   * string in the `screenshot` field of the response. Defaults to `false`.
   */
  returnScreenshot?: boolean;

  /**
   * When the `session` parameter is set, the proxy is ignored;
   * a session-specific proxy can be set in [`sessions.create`]{@link FlareSolverrCreateSessionRequest}.
   */
  proxy?: Proxy;

  /**
   * Length to wait in seconds after solving the challenge, and before returning
   * the results. Useful to allow it to load dynamic content. Defaults to `null`.
   */
  waitInSeconds?: number;

  /**
   * When `true`, FlareSolverr will prevent media resources (images, CSS, fonts)
   * from being loaded to speed up navigation. Defaults to `false`.
   */
  disableMedia?: boolean;
}

/// https://github.com/FlareSolverr/FlareSolverr/blob/master/src/flaresolverr_service.py#L466-L483
export interface ChallengeResolutionResult {
  url: string;
  status: number;

  /// nullable, see: https://github.com/webdriverio/webdriverio/blob/main/packages/wdio-types/src/Network.ts#L8
  cookies?: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    size: number;
    httpOnly: boolean;
    secure: boolean;
    session: boolean;
    sameSite: "Strict" | "Lax" | "None" | "Default";
  }[];
  userAgent: string;
  turnstile_token?: string;
  headers?: Record<string, string>[];
  response?: string;
  screenshot?: string;
}

interface FlareSolverrBaseWebResponse<
  Request extends FlareSolverrBaseWebRequest<Request, Response>,
  Response extends FlareSolverrBaseWebResponse<Request, Response>
> extends FlareSolverrBaseSuccessResponse<Request, Response> {
  solution: ChallengeResolutionResult;
}

interface FlareSolverrGetRequest extends FlareSolverrBaseWebRequest<FlareSolverrGetRequest, FlareSolverrGetResponse> {
  cmd: "request.get";

  /**
   * Number of times the Tab button is needed to be pressed to end up on the
   * Cloudflare® Turnstile™ CAPTCHA to verify it. After verifying the CAPTCHA,
   * the result will be stored in the solution under `turnstile_token`.
   * Defaults to `null`.
   */
  tabs_till_verify?: number;
}

interface FlareSolverrGetResponse extends FlareSolverrBaseWebResponse<FlareSolverrGetRequest, FlareSolverrGetResponse> {
}

interface FlareSolverrPostRequest extends FlareSolverrBaseWebRequest<FlareSolverrPostRequest, FlareSolverrPostResponse> {
  cmd: "request.post";
  postData?: string;
}

interface FlareSolverrPostResponse extends FlareSolverrBaseWebResponse<FlareSolverrPostRequest, FlareSolverrPostResponse> {
}


type Public<T extends LinkedType<T, any>> = Omit<T, "$linkedType">;
//export type CreateSessionRequest = Public<FlareSolverrCreateSessionRequest>;
// export type CreateSessionResponse = Public<FlareSolverrCreateSessionResponse>;
// export type ListSessionRequest = Public<FlareSolverrListSessionRequest>;
// export type ListSessionResponse = Public<FlareSolverrListSessionResponse>;
// export type DestroySessionRequest = Public<FlareSolverrDestroySessionRequest>;
// export type DestroySessionResponse = Public<FlareSolverrDestroySessionResponse>;
// export type GetRequest = Public<FlareSolverrGetRequest>;
// export type GetResponse = Public<FlareSolverrGetResponse>;
// export type PostRequest = Public<FlareSolverrPostRequest>;
// export type PostResponse = Public<FlareSolverrPostResponse>;


type Requests = FlareSolverrCreateSessionRequest
  | FlareSolverrListSessionRequest
  | FlareSolverrDestroySessionRequest
  | FlareSolverrGetRequest
  | FlareSolverrPostRequest;
export type FlareSolverRequestMap = { [T in Requests as T["cmd"]]: Public<T> };
export type FlareSolverrRequests = FlareSolverRequestMap[keyof FlareSolverRequestMap];
export type FlareSolverrResponseMap = { [T in Requests as T["cmd"]]: Public<T["$linkedType"]> };
export type FlareSolverrResponses = FlareSolverrResponseMap[keyof FlareSolverrResponseMap];

export type FlareSolverrRequest = Public<FlareSolverrBaseRequest>;
type FlareSolverrResponse<
  Request extends FlareSolverrBaseRequest<Response, Request>,
  Response extends FlareSolverrBaseSuccessResponse<Response, Request>,
> = Omit<Response, "$linkedType"> | FlareSolverrErrorResponse;

export type ResponseOf<T extends FlareSolverrRequest> =
  FlareSolverrResponse<T, FlareSolverrResponseMap[T["cmd"]]>;
