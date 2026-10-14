// ═════════════════════════════════════════════════════════════════════════════
//  Radar — Worker (Cloudflare Workers)
//  Serve os arquivos estáticos e faz o proxy das camadas de nuvens/temperatura
//  do OpenWeatherMap, para a chave não ficar exposta no HTML:
//    /api/owm/status                 → { ativo: true|false }
//    /api/owm/{camada}/{z}/{x}/{y}   → tile PNG (camada: clouds_new | temp_new)
//
//  Chave (painel Cloudflare → Worker → Settings → Variables and Secrets, ou
//  "npx wrangler secret put OWM_KEY").
// ═════════════════════════════════════════════════════════════════════════════

const CAMADAS = new Set(["clouds_new", "temp_new", "precipitation_new", "wind_new", "pressure_new"]);

async function owm(url, env) {
  if (url.pathname === "/api/owm/status") {
    return Response.json({ ativo: !!env.OWM_KEY });
  }
  const m = url.pathname.match(/^\/api\/owm\/([a-z_]+)\/(\d{1,2})\/(\d+)\/(\d+)(?:\.png)?$/);
  if (!m || !CAMADAS.has(m[1])) return new Response("rota inválida", { status: 404 });
  if (!env.OWM_KEY) return new Response("OWM_KEY não configurada", { status: 501 });

  const [, camada, z, x, y] = m;
  const r = await fetch(`https://tile.openweathermap.org/map/${camada}/${z}/${x}/${y}.png?appid=${env.OWM_KEY}`, {
    cf: { cacheTtl: 600, cacheEverything: true },   // alivia a cota: tiles mudam a cada ~10 min
    signal: AbortSignal.timeout(15000),
  });
  return new Response(r.body, {
    status: r.status,
    headers: {
      "Content-Type": r.headers.get("content-type") || "image/png",
      "Cache-Control": "public, max-age=600",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/owm/")) {
      try { return await owm(url, env); }
      catch (e) { return new Response("falha OWM: " + (e.message || e.name), { status: 502 }); }
    }
    return env.ASSETS.fetch(request);
  },
};
