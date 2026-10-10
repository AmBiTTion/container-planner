import http from "node:http";
import {
  readFile,
  mkdir,
  writeFile,
  readdir,
  rename,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateProject } from "./src/model.js";
import {handleRecords} from './record-store.mjs';
const root = path.dirname(fileURLToPath(import.meta.url)),
  data = process.env.CONTAINER_DATA_DIR ? path.resolve(process.env.CONTAINER_DATA_DIR) : path.join(root, "data"),
  dist = path.join(root, "dist"),
  port = Number(process.env.PORT || 4173);
await mkdir(data, { recursive: true });
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};
const safeId = (id) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const send = (res, code, value) => {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
async function body(req) {
  let size = 0,
    parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw Error("项目文件不能超过 12MB");
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
const writes = new Map();
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host))
      return send(res, 403, { error: "仅允许本机访问" });
    if (req.headers.origin && !["http://" + host].includes(req.headers.origin))
      return send(res, 403, { error: "拒绝跨站请求" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    const url = new URL(req.url, "http://" + host);
    if(await handleRecords(req,res,url,{data,body,send}))return;
    if(url.pathname==='/api/shutdown'&&req.method==='POST'){
      if(req.headers['content-type']!=='application/json')return send(res,415,{error:'需要 JSON 格式'});
      const request=await body(req);if(request.app!=='container-planner')return send(res,400,{error:'请求无效'});
      send(res,200,{ok:true});setTimeout(()=>{server.closeAllConnections();server.close(()=>process.exit(0));},100);return;
    }
    if (url.pathname === "/api/health")
      return send(res, 200, {
        app: "container-planner",
        version: 1,
        dataDir: data,
      });
    if (url.pathname === "/api/projects" && req.method === "GET") {
      const files = (await readdir(data)).filter(
        (f) => f.endsWith(".json") && !f.endsWith(".backup.json"),
      );
      const projects = [];
      for (const f of files) {
        try {
          const p = JSON.parse(await readFile(path.join(data, f), "utf8"));
          projects.push({
            id: p.id,
            name: p.name,
            updatedAt: p.updatedAt,
            count: p.placements.length,
          });
        } catch {}
      }
      return send(
        res,
        200,
        projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    }
    if (url.pathname.startsWith("/api/projects/")) {
      const id = url.pathname.slice("/api/projects/".length);
      if (!safeId(id)) return send(res, 400, { error: "项目编号错误" });
      const filename = path.join(data, id + ".json");
      if (req.method === "GET") {
        try {
          return send(res, 200, JSON.parse(await readFile(filename, "utf8")));
        } catch (e) {
          if (e.code === "ENOENT")
            return send(res, 404, { error: "找不到项目" });
          throw e;
        }
      }
      if (req.method === "PUT") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return send(res, 415, { error: "需要 JSON 格式" });
        const p = validateProject(await body(req));
        if (p.id !== id) throw Error("项目编号不一致");
        p.updatedAt = new Date().toISOString();
        const previous = writes.get(id) || Promise.resolve();
        const next = previous
          .catch(() => {})
          .then(async () => {
            try {
              const old = await readFile(filename);
              await writeFile(path.join(data, id + ".backup.json"), old);
            } catch (e) {
              if (e.code !== "ENOENT") throw e;
            }
            const temp = filename + ".tmp";
            await writeFile(temp, JSON.stringify(p, null, 2), "utf8");
            await rename(temp, filename);
          });
        writes.set(id, next);
        try {
          await next;
        } finally {
          if (writes.get(id) === next) writes.delete(id);
        }
        return send(res, 200, { ok: true, updatedAt: p.updatedAt });
      }
      return send(res, 405, { error: "不支持此操作" });
    }
    if (req.method !== "GET") return send(res, 405, { error: "不支持此操作" });
    const decoded = decodeURIComponent(url.pathname),
      file = path.resolve(
        dist,
        "." + (decoded === "/" ? "/index.html" : decoded),
      );
    if (!file.startsWith(dist + path.sep))
      return send(res, 403, { error: "无效路径" });
    try {
      const bytes = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": file.includes(path.sep + "assets" + path.sep)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
      res.end(bytes);
    } catch (e) {
      if (e.code === "ENOENT")
        return send(res, 404, { error: "页面不存在，请先构建应用" });
      throw e;
    }
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Container Planner http://127.0.0.1:${port} | ${data}`),
);
