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
 * Every Stremio method is reachable as /api/stremio/<method>:
 *   login, register, datastorePut, datastoreGet, datastoreMeta, …
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const target = `https://api.strem.io/api/${path.join("/")}`;
  const body = await req.text();

  try {
    const upstream = await fetch(target, {
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
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown proxy error";
    return Response.json({ error: { message: `Proxy error: ${message}` } }, { status: 502 });
  }
}
