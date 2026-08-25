export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stremio API proxy — port of the legacy server.js:67-137.
 *
 * api.strem.io validates the Origin header server-side and silently rejects
 * anything that isn't the Stremio web app, so browser calls have to be
 * relayed from here. `fetch` handles gzip/brotli transparently, which is why
 * the original https + zlib plumbing isn't needed.
 *
 * ---
 *
 * This used to forward *any* path to api.strem.io, from anyone, unlimited.
 * That is an open relay, and it was tolerable only while the app was anonymous
 * and nobody had heard of it:
 *
 *   - `login` takes an email and a password and reports whether they work, so
 *     an unrestricted relay is a credential-stuffing oracle for Stremio
 *     accounts, hosted on this domain and running from this deployment's IP.
 *     The attacker's own address never appears in Stremio's logs; ours does.
 *   - `register` would let anyone create Stremio accounts in bulk from here.
 *   - `path` was interpolated straight into the URL, so encoded traversal
 *     (`%2e%2e`) could reach paths on api.strem.io that are not the API at all.
 *
 * So the relay now carries only the three methods this app actually calls, and
 * only as a single path segment. Everything else is refused before a socket is
 * opened.
 */
const ALLOWED = new Set(["login", "datastoreGet", "datastorePut"]);

/**
 * Requests per window, per address.
 *
 * Best-effort and deliberately described as such: this counter lives in one
 * serverless instance's memory, so a platform running several instances
 * enforces several independent budgets, and a cold start forgets everything.
 * It is not a security boundary — the allow-list above is. What it buys is
 * that the cheapest kind of abuse, a loop against `login` from one host, stops
 * being free.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });

    // Bounded cleanup, so a long-lived instance seeing many addresses does not
    // grow this map without limit.
    if (hits.size > 5_000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

/** Stremio bodies are a method call with a few ids; anything larger is not ours. */
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  /*
     One segment, and it must be on the list.

     Checking `path.length` matters as much as the allow-list: a catch-all
     route hands back every segment, so `datastoreGet/../../something` would
     otherwise pass a membership test on its first element and still be
     rebuilt into a traversing URL below.
  */
  const method = path.length === 1 ? path[0] : "";
  if (!ALLOWED.has(method)) {
    return Response.json(
      { error: { message: "That Stremio method isn't available through this app." } },
      { status: 404 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (rateLimited(`${ip}:${method}`)) {
    return Response.json(
      { error: { message: "Too many requests. Try again in a minute." } },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return Response.json({ error: { message: "Request too large." } }, { status: 413 });
  }

  const body = await req.text();
  // `content-length` is a claim, not a fact — chunked requests omit it. The
  // read is what actually has to be measured.
  if (body.length > MAX_BODY_BYTES) {
    return Response.json({ error: { message: "Request too large." } }, { status: 413 });
  }

  try {
    const upstream = await fetch(`https://api.strem.io/api/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://web.stremio.com",
        Referer: "https://web.stremio.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body,
      cache: "no-store",
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // A relayed answer is per-caller and carries an authKey on the way in.
        // It must never sit in a shared cache.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown proxy error";
    return Response.json({ error: { message: `Proxy error: ${message}` } }, { status: 502 });
  }
}
