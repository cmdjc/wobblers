import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = process.cwd();
const distRoot = resolve(root, "dist");
const legacyRoot = resolve(root, "legacy");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const send = (res, status, body, type = "text/plain; charset=utf-8") => {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
};

export const THREE_FILE = resolve(root, "node_modules/three/build/three.js");

const resolveFile = (pathname) => {
  if (pathname === "/three.js") return THREE_FILE;
  const [base, relative] = pathname.startsWith("/legacy/")
    ? [legacyRoot, pathname.slice("/legacy/".length)]
    : [distRoot, pathname === "/" ? "index.html" : pathname.slice(1)];
  const file = resolve(base, relative);
  return file === base || file.startsWith(base + sep) ? file : null;
};

const handle = async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad request");
  }
  if (pathname === "/favicon.ico") return send(res, 204, "");
  const file = resolveFile(pathname);
  if (!file) return send(res, 403, "Forbidden");
  try {
    const body = await readFile(file);
    send(res, 200, body, mimeTypes[extname(file)] ?? "application/octet-stream");
  } catch {
    send(res, 404, "Not found");
  }
};

export async function startServer() {
  const server = createServer(handle);
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => {
      server.close(() => done());
      server.closeAllConnections();
    }),
  };
}
