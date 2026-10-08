import { getStore } from "@netlify/blobs";
import { createDashboardService } from "../../server/sync.mjs";

let service;
export default async function dashboard(request) {
  if (request.method !== "GET")
    return new Response(null, { status: 405, headers: { Allow: "GET" } });
  try {
    service ??= createDashboardService(
      getStore({ name: "goias-dashboard", consistency: "strong" }),
    );
    return Response.json(await service(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: "Não foi possível carregar a planilha.", detail: error.message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
