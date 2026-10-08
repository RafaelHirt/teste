import { getStore } from "@netlify/blobs";
import { synchronize } from "../../server/sync.mjs";

export const config = { schedule: "0 9 * * *" };

export default async function syncDaily() {
  try {
    const data = await synchronize(
      getStore({ name: "goias-dashboard", consistency: "strong" }),
    );
    console.info(
      `Sincronização concluída: ${data.records.length} registros, ${data.updatedAt}.`,
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Sincronização diária falhou:", error.message);
    return Response.json(
      { error: "Sincronização diária falhou." },
      { status: 503 },
    );
  }
}
