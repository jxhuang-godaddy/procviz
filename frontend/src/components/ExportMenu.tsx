import { useState, useRef, useEffect } from "react";
import { jsPDF } from "jspdf";
import type { Core } from "cytoscape";
import { SQL_KEYWORDS, SQL_FUNCTIONS } from "./DetailModal";

type ExportFormat = "png" | "jpg" | "pdf" | "json" | "html";

interface ExportMenuProps {
  getCy: () => Core | null;
  objectName: string;
}

const FORMATS: { value: ExportFormat; label: string; description: string }[] = [
  { value: "png", label: "PNG", description: "Image (transparent background)" },
  { value: "jpg", label: "JPG", description: "Image (white background)" },
  { value: "pdf", label: "PDF", description: "Single-page document" },
  { value: "html", label: "HTML", description: "Interactive viewer" },
  { value: "json", label: "JSON", description: "Cytoscape.js data" },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function esc(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function buildHtml(cy: Core, title: string): string {
  const json = cy.json() as { elements: unknown; style: unknown };
  const safeTitle = esc(title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#f9fafb}
#cy{width:100vw;height:100vh}
#toolbar{position:fixed;top:12px;right:12px;z-index:10;display:flex;gap:6px}
#toolbar button{background:#fff;border:1px solid #d1d5db;border-radius:4px;padding:4px 10px;font-size:13px;cursor:pointer}
#toolbar button:hover{background:#f3f4f6}
#title-badge{position:fixed;top:12px;left:12px;z-index:10;background:rgba(255,255,255,.9);border:1px solid #e5e7eb;border-radius:4px;padding:6px 12px;font-size:13px;font-weight:600}
/* Modal */
#overlay{display:none;position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.4);align-items:center;justify-content:center}
#overlay.open{display:flex}
#modal{background:#fff;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.2);width:min(768px,calc(100vw - 40px));max-height:min(600px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden}
#modal-hdr{display:flex;align-items:flex-start;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e5e7eb;cursor:grab;flex-shrink:0}
#modal-hdr:active{cursor:grabbing}
#modal-title{font-size:18px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#modal-sub{font-size:11px;color:#9ca3af;text-transform:uppercase;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hdr-btns{display:flex;gap:8px;align-items:center;flex-shrink:0}
.btn-copy,.btn-close{background:none;border:1px solid #d1d5db;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;color:#4b5563}
.btn-copy:hover,.btn-close:hover{background:#f3f4f6;color:#111827}
.btn-close{border:none;font-size:20px;line-height:1;padding:2px 6px}
#modal-body{padding:20px;overflow:auto;flex:1;min-height:0}
pre.sql{background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;padding:16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;line-height:1.6;overflow:auto}
.tok-kw{color:#2563eb;font-weight:600}.tok-fn{color:#7c3aed}.tok-str{color:#16a34a}
.tok-num{color:#ea580c}.tok-cmt{color:#9ca3af;font-style:italic}.tok-op{color:#dc2626}
.tok-punc{color:#6b7280}.tok-id{color:#1f2937}
.no-data{color:#9ca3af;font-size:14px}
</style>
</head>
<body>
<div id="title-badge">${safeTitle}</div>
<div id="toolbar">
  <button onclick="cy.fit(undefined,30)">Fit</button>
  <button onclick="cy.zoom(cy.zoom()*1.3);cy.center()">+</button>
  <button onclick="cy.zoom(cy.zoom()/1.3);cy.center()">&minus;</button>
</div>
<div id="cy"></div>
<div id="overlay"><div id="modal">
  <div id="modal-hdr"><div style="min-width:0;margin-right:16px"><div id="modal-title"></div><div id="modal-sub"></div></div>
  <div class="hdr-btns"><button class="btn-copy" id="btn-copy" onclick="copyText()">Copy</button><button class="btn-close" onclick="closeModal()">&times;</button></div></div>
  <div id="modal-body"></div>
</div></div>

<script src="https://unpkg.com/cytoscape@3.33.2/dist/cytoscape.min.js"><\/script>
<script src="https://unpkg.com/dagre@0.8.5/dist/dagre.min.js"><\/script>
<script src="https://unpkg.com/cytoscape-dagre@2.5.0/cytoscape-dagre.js"><\/script>
<script>
cytoscape.use(cytoscapeDagre);
var cy = cytoscape({
  container: document.getElementById("cy"),
  elements: ${JSON.stringify(json.elements)},
  style: ${JSON.stringify(json.style)},
  layout: { name: "dagre", rankDir: "LR", nodeSep: 30, rankSep: 100, padding: 30 }
});

/* ── SQL tokenizer ── */
var KW = new Set(${JSON.stringify([...SQL_KEYWORDS])});
var FN = new Set(${JSON.stringify([...SQL_FUNCTIONS])});

function tokenize(s) {
  var t=[],i=0,L=s.length;
  while(i<L){
    var c=s[i];
    if(" \\t\\n\\r".indexOf(c)>=0){var j=i;while(i<L&&" \\t\\n\\r".indexOf(s[i])>=0)i++;t.push({t:"ws",v:s.slice(j,i)});continue}
    if(c==="-"&&i+1<L&&s[i+1]==="-"){var j=i;while(i<L&&s[i]!=="\\n")i++;t.push({t:"cmt",v:s.slice(j,i)});continue}
    if(c==="/"&&i+1<L&&s[i+1]==="*"){var j=i;i+=2;while(i<L&&!(s[i]==="*"&&i+1<L&&s[i+1]==="/"))i++;if(i<L)i+=2;t.push({t:"cmt",v:s.slice(j,i)});continue}
    if(c==="'"){var j=i;i++;while(i<L){if(s[i]==="'"&&i+1<L&&s[i+1]==="'"){i+=2}else if(s[i]==="'"){i++;break}else{i++}}t.push({t:"str",v:s.slice(j,i)});continue}
    if(c>="0"&&c<="9"){var j=i;while(i<L&&((s[i]>="0"&&s[i]<="9")||s[i]==="."))i++;t.push({t:"num",v:s.slice(j,i)});continue}
    if((c>="a"&&c<="z")||(c>="A"&&c<="Z")||c==="_"){var j=i;while(i<L&&((s[i]>="a"&&s[i]<="z")||(s[i]>="A"&&s[i]<="Z")||(s[i]>="0"&&s[i]<="9")||s[i]==="_"))i++;var w=s.slice(j,i),u=w.toUpperCase();t.push({t:KW.has(u)?"kw":FN.has(u)?"fn":"id",v:w});continue}
    if("=<>+-*/%&|^~".indexOf(c)>=0){t.push({t:"op",v:c});i++;continue}
    if("(),;.".indexOf(c)>=0){t.push({t:"punc",v:c});i++;continue}
    t.push({t:"id",v:c});i++;
  }
  return t;
}

var CLS={kw:"tok-kw",fn:"tok-fn",str:"tok-str",num:"tok-num",cmt:"tok-cmt",op:"tok-op",punc:"tok-punc",id:"tok-id"};

function sqlHtml(sql) {
  var s = sql.replace(/\\r\\n/g,"\\n").replace(/\\r/g,"\\n");
  var toks = tokenize(s);
  var h = "";
  for (var k=0;k<toks.length;k++) {
    var tk=toks[k], ev=tk.v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    if(tk.t==="ws") h+=ev;
    else h+='<span class="'+CLS[tk.t]+'">'+ev+'<\\/span>';
  }
  return '<pre class="sql">'+h+'<\\/pre>';
}

/* ── find CREATE SQL for volatile tables ── */
function findCreateSql(name) {
  var lower = name.toLowerCase();
  var nodes = cy.nodes();
  for (var k=0;k<nodes.length;k++) {
    var d = nodes[k].data();
    if (d.type !== "step") continue;
    var sql = (d.detail && d.detail.sql) || "";
    var m = sql.match(/CREATE\\s+(?:VOLATILE\\s+|MULTISET\\s+|SET\\s+)*TABLE\\s+(\\S+)/i);
    if (m && m[1].toLowerCase() === lower) return sql;
  }
  return null;
}

/* ── modal ── */
var _copyText = "";

function showModal(title, sub, bodyHtml, raw) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-sub").textContent = sub;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  _copyText = raw || "";
  document.getElementById("btn-copy").style.display = raw ? "" : "none";
  document.getElementById("overlay").className = "open";
}

function closeModal() { document.getElementById("overlay").className = ""; }

function copyText() {
  if (!_copyText) return;
  navigator.clipboard.writeText(_copyText).then(function() {
    var b = document.getElementById("btn-copy");
    b.textContent = "Copied!";
    setTimeout(function(){ b.textContent = "Copy"; }, 2000);
  });
}

document.getElementById("overlay").addEventListener("click", function(e) {
  if (e.target === this) closeModal();
});

/* ── node tap handler ── */
cy.on("tap", "node", function(evt) {
  var d = evt.target.data();
  var det = d.detail || {};

  if (d.type === "step") {
    var sql = det.sql || "";
    showModal(d.label, "SQL Step", sql ? sqlHtml(sql) : '<div class="no-data">SQL text not available for this step.<\\/div>', sql);
  }
  else if (d.type === "proc" || d.type === "macro") {
    var ddl = det.ddl || "";
    var tl = d.type === "macro" ? "Macro" : "Procedure";
    showModal(d.label, tl + " Definition \\u2014 " + d.id, ddl ? sqlHtml(ddl) : '<div class="no-data">DDL not available for this ' + tl.toLowerCase() + '.<\\/div>', ddl);
  }
  else if (d.type === "volatile") {
    var cs = findCreateSql(d.id);
    showModal(d.label, "Volatile Table \\u2014 " + d.id, cs ? sqlHtml(cs) : '<div class="no-data">Volatile table \\u2014 no DDL available.<\\/div>', cs || "");
  }
  else if (d.type === "table") {
    showModal(d.label, "Table / View \\u2014 " + d.id, '<div class="no-data">DDL not available in exported viewer. Use ProcViz app for live DDL lookup.<\\/div>', "");
  }
  else {
    var params = det.parameters || [];
    if (params.length) {
      var h = '<div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;margin-bottom:8px">Parameters<\\/div>';
      h += '<table style="font-size:12px;font-family:monospace;width:100%"><tr style="color:#9ca3af;border-bottom:1px solid #e5e7eb"><th style="text-align:left;padding:4px 12px 4px 0">Direction<\\/th><th style="text-align:left;padding:4px 12px 4px 0">Name<\\/th><th style="text-align:left;padding:4px 0">Type<\\/th><\\/tr>';
      for (var k=0;k<params.length;k++) h += '<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:4px 12px 4px 0">'+(params[k].direction||"")+'<\\/td><td style="padding:4px 12px 4px 0">'+(params[k].name||"")+'<\\/td><td style="padding:4px 0">'+(params[k].data_type||"")+'<\\/td><\\/tr>';
      h += '<\\/table>';
      showModal(d.label, d.type, h, "");
    } else {
      showModal(d.label, d.type, '<div class="no-data">No additional details available.<\\/div>', "");
    }
  }
});
<\/script>
</body>
</html>`;
}

function exportDiagram(cy: Core, format: ExportFormat, objectName: string) {
  const safeName = objectName.replace(/[^a-zA-Z0-9_.-]/g, "_");

  if (format === "html") {
    const html = buildHtml(cy, objectName);
    const blob = new Blob([html], { type: "text/html" });
    downloadBlob(blob, `${safeName}.html`);
    return;
  }

  if (format === "json") {
    const data = cy.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${safeName}.cyjs`);
    return;
  }

  if (format === "pdf") {
    const dataUrl = cy.png({ output: "base64uri", full: true, scale: 2, bg: "#ffffff" }) as unknown as string;
    const img = new Image();
    img.onload = () => {
      const margin = 40;
      // Choose landscape or portrait based on image aspect ratio
      const landscape = img.width > img.height;
      const pageW = landscape ? 841.89 : 595.28; // A4 in points
      const pageH = landscape ? 595.28 : 841.89;
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;
      const scale = Math.min(usableW / img.width, usableH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const x = margin + (usableW - drawW) / 2;
      const y = margin + (usableH - drawH) / 2;
      const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
      doc.addImage(dataUrl, "PNG", x, y, drawW, drawH);
      doc.save(`${safeName}.pdf`);
    };
    img.src = dataUrl;
    return;
  }

  const options = {
    output: "blob" as const,
    full: true,
    scale: 2,
    bg: format === "jpg" ? "#ffffff" : undefined,
  };

  const blob = format === "png" ? cy.png(options) : cy.jpg(options);
  downloadBlob(blob as unknown as Blob, `${safeName}.${format}`);
}

export default function ExportMenu({ getCy, objectName }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleExport(format: ExportFormat) {
    const cy = getCy();
    if (!cy) return;
    exportDiagram(cy, format, objectName);
    setOpen(false);
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-white border border-gray-300 rounded px-3 py-1.5 text-sm shadow-sm hover:bg-gray-50 flex items-center gap-1.5"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60">
          <path d="M8 10L4 6h8l-4 4z" fill="currentColor" />
          <path d="M2 12h12v1.5H2z" fill="currentColor" />
          <path d="M8 2v7" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Export
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg py-1">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleExport(f.value)}
              className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center justify-between"
            >
              <span className="text-sm font-medium">{f.label}</span>
              <span className="text-xs text-gray-500">{f.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
