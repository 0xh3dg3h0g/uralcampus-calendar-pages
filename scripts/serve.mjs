import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve("public");
const port = Number(process.env.PORT ?? 4173);

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".ics", "text/calendar; charset=utf-8"],
  [".old", "text/calendar; charset=utf-8"],
]);

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.resolve(root, `.${requested}`);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = createServer(async (request, response) => {
  const file = safePath(request.url ?? "/");
  if (!file) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    response.setHeader("content-type", types.get(path.extname(file)) ?? "application/octet-stream");
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
});
