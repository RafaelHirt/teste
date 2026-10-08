import { createServer as createHTTPServer } from "node:http";
import { createServer as createViteServer } from "vite";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { createDashboardService } from "../server/sync.mjs";
import { demoSnapshot } from "../shared/demo.js";

const directory = resolve(".cache");
const store = {
  async get(key) {
    try {
      return JSON.parse(
        await readFile(resolve(directory, `${key}.json`), "utf8"),
      );
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  },
  async setJSON(key, value) {
    await mkdir(directory, { recursive: true });
    const destination = resolve(directory, `${key}.json`);
    await writeFile(`${destination}.tmp`, JSON.stringify(value));
    await rename(`${destination}.tmp`, destination);
  },
};
const service = createDashboardService(store);
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "spa",
});
const server = createHTTPServer(async (request, response) => {
  if (request.url?.split("?")[0] !== "/api/dashboard")
    return vite.middlewares(request, response);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    return response.end("{}");
  }
  try {
    response.end(
      JSON.stringify(
        process.argv.includes("--demo") ? demoSnapshot() : await service(),
      ),
    );
  } catch (error) {
    response.statusCode = 503;
    response.end(
      JSON.stringify({
        error: "Não foi possível carregar a planilha.",
        detail: error.message,
      }),
    );
  }
});
server.listen(5173, "0.0.0.0", () =>
  console.info("Servidor de desenvolvimento disponível na porta 5173."),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    await vite.close();
    server.close(() => process.exit(0));
  });
