import { allTypes } from "./model.js";
import {renderReport} from './report-html.js';
import {
  analyze,
  loadingSequence,
} from "./engine.js";
export function download(content, name, mime = "text/plain") {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const cell = (v) => {
  const s = String(v ?? "");
  return (
    '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
  );
};
export function exportCsv(p, mode) {
  const types = allTypes(p),
    items = mode === "container" ? loadingSequence(p) : p.palletPlacements,
    report = analyze(p, mode);
  const rows = [
    [
      "装载次序",
      "名称",
      "类型",
      "X(mm)",
      "Y(mm)",
      "Z(mm)",
      "水平角度",
      "有效长(mm)",
      "有效宽(mm)",
      "有效高(mm)",
      "含包装重量(kg)",
      "层级",
      "锁定",
      "批次",
      "卸货顺序",
      "内部件数",
    ],
  ];
  for (const [index, i] of items.entries()) {
    const t = types.find((t) => t.id === i.typeId);
    rows.push([
      index + 1,
      t.name,
      t.kind,
      i.x,
      i.y,
      i.z,
      i.rotation,
      t.effectiveLength,
      t.effectiveWidth,
      t.effectiveHeight,
      t.weight,
      report.levels[i.id],
      i.locked ? "是" : "否",
      t.batch,
      t.unload,
      t.children?.length || 1,
    ]);
  }
  rows.push(
    [],
    ["载货重量(kg)", report.weight],
    ["含柜/托总重(kg)", report.gross],
    ["空间利用率(%)", (report.utilization * 100).toFixed(2)],
    ["违规/提示", report.issues.map((i) => i.text).join("；")],
  );
  download(
    "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n"),
    p.name + "-装载明细.csv",
    "text/csv",
  );
}
export {renderReport} from './report-html.js';
export function exportReport(p, mode, screenshot, language='zh-CN') {
  const html=renderReport(p,mode,screenshot,language);
  download(html,p.name+(language==='en'?'-Loading-Report-EN.html':'-装载报告.html'),'text/html');
}
