export class UsageError extends Error { }

/**
 *
 * @param {string} usage
 * @param {boolean} sequential
 * @param {(() => Promise<any>[])} createPromises
 * @returns {Promise<void>}
 */
export async function exec(usage, sequential, createPromises) {
    let value;
    try {
        value = await firstOk(sequential, createPromises());
    } catch (err) {
        console.error(err);
        if (!(err instanceof UsageError))
            throw err;

        console.error(`Usage: ${process.argv[1]} ${usage}`);
        return;
    }

    process.stdout.write("result=" + JSON.stringify(value, undefined, 0));
    process.stdout.write('\n');
}

/**
 *
 * @param {() => Record<string, string>} argv
 * @returns {Record<string, string>}
 */
export const args = (argv) => {
    const args = argv();
    Object.entries(args).forEach(([k, v]) => { if (!v) throw new UsageError(`${k} not specified`) });
    return args;
};

/**
 *
 * @typedef T
 * @param {Record<string, string>} args
 * @param {Record<string, T>} object
 * @param {string} key
 * @returns {T}
 */
export function get(args, object, key) {
    const argValue = args[key];
    const retValue = object[argValue];
    if (!retValue)
        throw new UsageError(`Invalid ${key}: ${argValue}`);

    return retValue;
}

/**
 *
 * @param {Record<string, string>} object
 * @returns {string}
 */
export const queryParams = (object) => '?' + Object.entries(object)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/**
 *
 * @typedef T
 * @param {boolean} sequential
 * @param {(() => Promise<T>)[]} promises
 * @returns {T}
 */
export async function firstOk(sequential, promises) {
    const errors = [];
    if (sequential) {
        for (const promise of promises) {
            try {
                const value = await promise();
                if (!value) continue;
                return value;
            } catch (err) {
                errors.push(err);
                if (process.env.DEBUG === '1') console.log(err);
            }
        }
    } else {
        const wrapped = promises.map((promise) => new Promise((res, rej) => {
            promise().then((ret) => res(ret)).catch((err) => errors.push(err));
        }));

        try {
            return await Promise.any(wrapped);
        } catch (err) {
            if (process.env.DEBUG === '1') console.log(err);
        }
    }

    throw new Error(`All promises failed:\n\t- ${errors.join('\n\t- ')}`);
}

/**
 *
 * @param {string | URL} url
 * @param {RequestInit?} options
 * @returns {Promise<Response>}
 */
export async function request(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        let text = "<empty response>";
        try { text = await response.text(); } catch { /* Ignore */ }
        throw new Error(`Request at ${url} failed with status code: ${res.status} ${res.statusText}\n${text}`);
    }

    return response;
}

/**
 *
 * @param {string | URL} url
 * @param {RequestInit?} options
 * @returns {Promise<{ url: string; size: string; headers: Record<string, string>; response: Response }>}
 */
export async function head(url, options = {}) {
    let response = await fetch(url, { method: "HEAD", ...options });
    if (!response.ok) {
        response = await fetch(url, {
            headers: { range: "bytes=0-0", ...(options.headers ?? {}) },
            ...options
        });
        if (response.body) await response.body.cancel();
    }
    if (!response.ok && response.status !== 206) {
        let text = "<empty response>";
        try { text = await response.text(); } catch { /* Ignore */ }
        throw new Error(`Request at ${url} failed with status code: ${res.status} ${res.statusText}\n${text}`);
    }

    const etag = response.headers.get('etag');
    const range = response.headers.get('content-range');
    let size = response.headers.get('content-length') ?? '';
    if (response.status === 206 && range) size = range.split('/')[1] ?? size;
    return { url: response.url, size, etag, headers: response.headers, response };
}

/**
 *
 * @param {string | URL} url
 * @param {RequestInit?} options
 * @returns {Promise<string>}
 */
export const text = async (url, options = {}) => await (await request(url, options)).text();

/**
 *
 * @param {string | URL} url
 * @param {RequestInit?} options
 * @returns {Promise<any>}
 */
export const json = async (url, options = {}) => await (await request(url, options)).json();
