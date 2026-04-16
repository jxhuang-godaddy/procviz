import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CytoscapeEdgeData, CytoscapeNodeData, GraphResponse } from "../types/graph";
import type { DetailSelection } from "../App";
import { getDdl } from "../api/client";

/* ─── SQL Syntax Highlighting ─────────────────────────────────── */

export const SQL_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET",
  "DELETE", "MERGE", "USING", "WHEN", "MATCHED", "THEN", "ELSE", "END",
  "CASE", "BEGIN", "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN", "LIKE",
  "IS", "NULL", "AS", "ALL", "ANY", "DISTINCT", "ON", "JOIN", "LEFT",
  "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "ORDER", "BY", "GROUP",
  "HAVING", "UNION", "INTERSECT", "EXCEPT", "LIMIT", "TOP", "WITH",
  "CREATE", "ALTER", "DROP", "TABLE", "VIEW", "INDEX", "PROCEDURE",
  "MACRO", "REPLACE", "DATABASE", "COLUMN", "PRIMARY", "KEY", "FOREIGN",
  "REFERENCES", "UNIQUE", "CHECK", "DEFAULT", "CONSTRAINT",
  "MULTISET", "VOLATILE", "GLOBAL", "TEMPORARY", "COLLECT", "STATISTICS",
  "COMMENT", "FALLBACK", "NO", "BEFORE", "JOURNAL", "AFTER", "CALL",
  "IF", "ELSEIF", "WHILE", "FOR", "LOOP", "LEAVE", "ITERATE", "DECLARE",
  "HANDLER", "CONTINUE", "EXIT", "SIGNAL", "RESIGNAL",
  "INTEGER", "INT", "BIGINT", "SMALLINT", "BYTEINT", "DECIMAL", "NUMERIC",
  "FLOAT", "DOUBLE", "PRECISION", "CHAR", "CHARACTER", "VARCHAR", "DATE",
  "TIMESTAMP", "TIME", "CLOB", "BLOB", "BYTE", "NUMBER", "LONG",
]);

export const SQL_FUNCTIONS = new Set([
  "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "CAST", "TRIM",
  "SUBSTRING", "SUBSTR", "UPPER", "LOWER", "NULLIF", "NVL", "ZEROIFNULL",
  "NULLIFZERO", "STRTOK", "OREPLACE", "OTRANSLATE", "POSITION",
  "LENGTH", "CHAR_LENGTH", "EXTRACT", "ADD_MONTHS", "MONTHS_BETWEEN",
  "CURRENT_DATE", "CURRENT_TIMESTAMP", "CURRENT_TIME", "ROW_NUMBER",
  "RANK", "DENSE_RANK", "LEAD", "LAG", "FIRST_VALUE", "LAST_VALUE",
  "OVER", "PARTITION", "ROWS", "RANGE", "UNBOUNDED", "PRECEDING",
  "FOLLOWING", "ABS", "MOD", "FLOOR", "CEIL", "ROUND", "TRUNC",
  "TO_CHAR", "TO_DATE", "TO_NUMBER", "TO_TIMESTAMP",
]);

type TokenType =
  | "keyword" | "function" | "string" | "number"
  | "comment" | "operator" | "punctuation" | "ws" | "ident";

interface Token { type: TokenType; value: string }

function tokenizeSql(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      const s = i;
      while (i < len && " \t\n\r".includes(sql[i])) i++;
      tokens.push({ type: "ws", value: sql.slice(s, i) });
      continue;
    }
    if (ch === "-" && i + 1 < len && sql[i + 1] === "-") {
      const s = i;
      while (i < len && sql[i] !== "\n") i++;
      tokens.push({ type: "comment", value: sql.slice(s, i) });
      continue;
    }
    if (ch === "/" && i + 1 < len && sql[i + 1] === "*") {
      const s = i; i += 2;
      while (i < len && !(sql[i] === "*" && i + 1 < len && sql[i + 1] === "/")) i++;
      if (i < len) i += 2;
      tokens.push({ type: "comment", value: sql.slice(s, i) });
      continue;
    }
    if (ch === "'") {
      const s = i; i++;
      while (i < len) {
        if (sql[i] === "'" && i + 1 < len && sql[i + 1] === "'") { i += 2; }
        else if (sql[i] === "'") { i++; break; }
        else { i++; }
      }
      tokens.push({ type: "string", value: sql.slice(s, i) });
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      const s = i;
      while (i < len && ((sql[i] >= "0" && sql[i] <= "9") || sql[i] === ".")) i++;
      tokens.push({ type: "number", value: sql.slice(s, i) });
      continue;
    }
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      const s = i;
      while (i < len && ((sql[i] >= "a" && sql[i] <= "z") || (sql[i] >= "A" && sql[i] <= "Z") || (sql[i] >= "0" && sql[i] <= "9") || sql[i] === "_")) i++;
      const word = sql.slice(s, i);
      const upper = word.toUpperCase();
      tokens.push({
        type: SQL_KEYWORDS.has(upper) ? "keyword" : SQL_FUNCTIONS.has(upper) ? "function" : "ident",
        value: word,
      });
      continue;
    }
    if (ch === "<" && i + 1 < len && (sql[i + 1] === "=" || sql[i + 1] === ">")) {
      tokens.push({ type: "operator", value: sql.slice(i, i + 2) }); i += 2; continue;
    }
    if (ch === ">" && i + 1 < len && sql[i + 1] === "=") {
      tokens.push({ type: "operator", value: ">=" }); i += 2; continue;
    }
    if (ch === "!" && i + 1 < len && sql[i + 1] === "=") {
      tokens.push({ type: "operator", value: "!=" }); i += 2; continue;
    }
    if (ch === "|" && i + 1 < len && sql[i + 1] === "|") {
      tokens.push({ type: "operator", value: "||" }); i += 2; continue;
    }
    if ("=<>+-*/%&|^~".includes(ch)) {
      tokens.push({ type: "operator", value: ch }); i++; continue;
    }
    if ("(),;.".includes(ch)) {
      tokens.push({ type: "punctuation", value: ch }); i++; continue;
    }
    tokens.push({ type: "ident", value: ch }); i++;
  }
  return tokens;
}

const TOKEN_STYLE: Record<TokenType, CSSProperties | undefined> = {
  keyword:     { color: "#2563eb", fontWeight: 600 },
  function:    { color: "#7c3aed" },
  string:      { color: "#16a34a" },
  number:      { color: "#ea580c" },
  comment:     { color: "#9ca3af", fontStyle: "italic" },
  operator:    { color: "#dc2626" },
  punctuation: { color: "#6b7280" },
  ws:          undefined,
  ident:       { color: "#1f2937" },
};

/* ─── SQL Formatting & Display ─────────────────────────────────── */

function formatSql(sql: string): string {
  // Normalize all line endings (CRLF, CR, LF) to LF
  const normalized = sql.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized
    .replace(
      /\s+(SELECT|FROM|WHERE|AND|OR|JOIN|LEFT|RIGHT|INNER|CROSS|ON|INSERT|INTO|VALUES|UPDATE|SET|DELETE|MERGE|USING|WHEN|GROUP|ORDER|HAVING|UNION|LIMIT)\b/gi,
      (_m, kw) => `\n${kw}`,
    )
    .trim();
}

function SqlBlock({ sql, preserveLines = false }: { sql: string; preserveLines?: boolean }) {
  const tokens = useMemo(() => tokenizeSql(preserveLines ? sql.replace(/\r\n/g, "\n").replace(/\r/g, "\n") : formatSql(sql)), [sql, preserveLines]);

  const lines = useMemo(() => {
    const result: Token[][] = [[]];
    for (const tok of tokens) {
      if (tok.value.includes("\n")) {
        const parts = tok.value.split("\n");
        if (parts[0]) result[result.length - 1].push({ type: tok.type, value: parts[0] });
        for (let j = 1; j < parts.length; j++) {
          result.push([]);
          if (parts[j]) result[result.length - 1].push({ type: tok.type, value: parts[j] });
        }
      } else {
        result[result.length - 1].push(tok);
      }
    }
    return result;
  }, [tokens]);

  const gutterW = `${String(lines.length).length + 1}ch`;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded text-xs font-mono overflow-auto flex-1 min-h-0">
      <table className="border-collapse w-full">
        <tbody>
          {lines.map((lineTokens, idx) => (
            <tr key={idx} className="leading-relaxed">
              <td
                className="select-none text-right text-gray-400 pr-3 pl-2 align-top border-r border-gray-200"
                style={{ minWidth: gutterW }}
              >
                {idx + 1}
              </td>
              <td className="pl-3 pr-4 whitespace-pre-wrap break-words">
                {lineTokens.length === 0
                  ? "\u00a0"
                  : lineTokens.map((tok, i) =>
                      tok.type === "ws"
                        ? tok.value
                        : <span key={i} style={TOKEN_STYLE[tok.type]}>{tok.value}</span>,
                    )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Copy Button ──────────────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors shrink-0"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <span className="text-green-600">Copied</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
            <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

/* ─── Resizable Modal ──────────────────────────────────────────── */

interface DetailModalProps {
  detail: DetailSelection;
  onClose: () => void;
  graph?: GraphResponse | null;
}

type DragOp =
  | { kind: "resize"; startX: number; startY: number; startW: number; startH: number; edge: "right" | "bottom" | "corner" }
  | { kind: "move"; startX: number; startY: number; startLeft: number; startTop: number };

export default function DetailModal({ detail, onClose, graph }: DetailModalProps) {
  const initW = Math.min(768, window.innerWidth - 40);
  const initH = Math.min(500, window.innerHeight - 40);
  const [size, setSize] = useState({ w: initW, h: initH });
  // null pos = centered via flexbox; once dragged, absolute positioning
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragRef = useRef<DragOp | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      if (d.kind === "resize") {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        const w = (d.edge === "right" || d.edge === "corner")
          ? Math.max(400, Math.min(window.innerWidth - 20, d.startW + dx))
          : d.startW;
        const h = (d.edge === "bottom" || d.edge === "corner")
          ? Math.max(200, Math.min(window.innerHeight - 20, d.startH + dy))
          : d.startH;
        setSize({ w, h });
      } else {
        const left = Math.max(0, Math.min(window.innerWidth - 100, d.startLeft + e.clientX - d.startX));
        const top = Math.max(0, Math.min(window.innerHeight - 40, d.startTop + e.clientY - d.startY));
        setPos({ left, top });
      }
    }
    function onUp() {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = useCallback(
    (edge: "right" | "bottom" | "corner") => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // If still centered, snapshot current center position before resize
      if (!posRef.current) {
        const s = sizeRef.current;
        setPos({
          left: (window.innerWidth - s.w) / 2,
          top: (window.innerHeight - s.h) / 2,
        });
      }
      const s = sizeRef.current;
      dragRef.current = { kind: "resize", startX: e.clientX, startY: e.clientY, startW: s.w, startH: s.h, edge };
      document.body.style.cursor =
        edge === "corner" ? "se-resize" : edge === "right" ? "e-resize" : "s-resize";
      document.body.style.userSelect = "none";
    },
    [],
  );

  const startMove = useCallback((e: React.MouseEvent) => {
    // Only drag from the header area, not from buttons inside it
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const p = posRef.current ?? {
      left: (window.innerWidth - sizeRef.current.w) / 2,
      top: (window.innerHeight - sizeRef.current.h) / 2,
    };
    if (!posRef.current) setPos(p);
    dragRef.current = { kind: "move", startX: e.clientX, startY: e.clientY, startLeft: p.left, startTop: p.top };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  }, []);

  if (!detail) return null;

  const modalStyle: CSSProperties = pos
    ? { width: size.w, height: size.h, position: "absolute", left: pos.left, top: pos.top }
    : { width: size.w, height: size.h };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl flex flex-col relative"
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {detail.kind === "node" && <NodeModal node={detail.data} onClose={onClose} onHeaderMouseDown={startMove} graph={graph} />}
        {detail.kind === "edge" && <EdgeModal edge={detail.data} onClose={onClose} onHeaderMouseDown={startMove} />}

        {/* Resize handles */}
        <div
          className="absolute top-2 -right-1.5 bottom-2 w-3 cursor-e-resize hover:bg-blue-400/20 rounded-r transition-colors"
          onMouseDown={startResize("right")}
        />
        <div
          className="absolute -bottom-1.5 left-2 right-2 h-3 cursor-s-resize hover:bg-blue-400/20 rounded-b transition-colors"
          onMouseDown={startResize("bottom")}
        />
        <div
          className="absolute -bottom-2 -right-2 w-5 h-5 cursor-se-resize hover:bg-blue-400/30 rounded-br-lg transition-colors"
          onMouseDown={startResize("corner")}
        >
          <svg viewBox="0 0 20 20" className="w-full h-full text-gray-300">
            <path d="M14 20L20 14M10 20L20 10M6 20L20 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────────────── */

function ModalHeader({
  title,
  subtitle,
  onClose,
  copyText,
  onMouseDown,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  copyText?: string;
  onMouseDown?: React.MouseEventHandler;
}) {
  return (
    <div
      className="flex items-start justify-between px-5 py-4 border-b border-gray-200 shrink-0 cursor-grab active:cursor-grabbing"
      onMouseDown={onMouseDown}
    >
      <div className="min-w-0 mr-4">
        <div className="font-semibold text-lg text-gray-900 truncate">{title}</div>
        <div className="text-xs text-gray-400 uppercase mt-0.5 truncate">{subtitle}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {copyText && <CopyButton text={copyText} />}
        <button
          className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
          onClick={onClose}
        >
          &times;
        </button>
      </div>
    </div>
  );
}

interface ModalContentProps {
  onClose: () => void;
  onHeaderMouseDown?: React.MouseEventHandler;
  graph?: GraphResponse | null;
}

function NodeModal({ node, onClose, onHeaderMouseDown, graph }: { node: CytoscapeNodeData } & ModalContentProps) {
  if (node.type === "step") return <StepNodeModal node={node} onClose={onClose} onHeaderMouseDown={onHeaderMouseDown} />;
  if (node.type === "table" || node.type === "volatile") return <TableNodeModal node={node} onClose={onClose} onHeaderMouseDown={onHeaderMouseDown} graph={graph} />;
  if (node.type === "proc" || node.type === "macro") return <ProcNodeModal node={node} onClose={onClose} onHeaderMouseDown={onHeaderMouseDown} />;
  return <GenericNodeModal node={node} onClose={onClose} onHeaderMouseDown={onHeaderMouseDown} />;
}

function StepNodeModal({ node, onClose, onHeaderMouseDown }: { node: CytoscapeNodeData } & ModalContentProps) {
  const sql = (node.detail?.sql as string) || "";
  return (
    <>
      <ModalHeader title={node.label} subtitle="SQL Step" onClose={onClose} copyText={sql || undefined} onMouseDown={onHeaderMouseDown} />
      <div className="p-5 flex-1 min-h-0 flex flex-col overflow-hidden">
        {sql ? <SqlBlock sql={sql} /> : (
          <div className="text-gray-400 text-sm">SQL text not available for this step.</div>
        )}
      </div>
    </>
  );
}

function ProcNodeModal({ node, onClose, onHeaderMouseDown }: { node: CytoscapeNodeData } & ModalContentProps) {
  const ddl = (node.detail?.ddl as string) || "";
  const typeLabel = node.type === "macro" ? "Macro" : "Procedure";

  return (
    <>
      <ModalHeader
        title={node.label}
        subtitle={`${typeLabel} Definition \u2014 ${node.id}`}
        onClose={onClose}
        copyText={ddl || undefined}
        onMouseDown={onHeaderMouseDown}
      />
      <div className="p-5 flex-1 min-h-0 flex flex-col overflow-hidden">
        {ddl ? <SqlBlock sql={ddl} preserveLines /> : (
          <div className="text-gray-400 text-sm">DDL not available for this {typeLabel.toLowerCase()}.</div>
        )}
      </div>
    </>
  );
}

function _findCreateSql(tableName: string, graph?: GraphResponse | null): string | null {
  if (!graph) return null;
  const nameLower = tableName.toLowerCase();
  for (const n of graph.nodes) {
    if (n.type !== "step") continue;
    const sql = (n.detail?.sql as string) || "";
    // Match CREATE [VOLATILE|MULTISET|SET] TABLE <name>
    const m = sql.match(/CREATE\s+(?:VOLATILE\s+|MULTISET\s+|SET\s+)*TABLE\s+(\S+)/i);
    if (m && m[1].toLowerCase() === nameLower) return sql;
  }
  return null;
}

function TableNodeModal({ node, onClose, onHeaderMouseDown, graph }: { node: CytoscapeNodeData } & ModalContentProps) {
  const [ddl, setDdl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const qualifiedName = node.id;
  const isVolatile = node.type === "volatile" || !qualifiedName.includes(".");

  useEffect(() => {
    if (isVolatile) {
      // Look up the CREATE statement from step nodes in the graph
      const createSql = _findCreateSql(qualifiedName, graph);
      setDdl(createSql || "Volatile table \u2014 no DDL available.");
      setLoading(false);
      return;
    }
    const parts = qualifiedName.split(".");
    const db = parts[0];
    const name = parts.slice(1).join(".");
    setLoading(true);
    setError(null);
    getDdl(db, name)
      .then((text) => setDdl(text || "No DDL found."))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [qualifiedName, isVolatile, graph]);

  const subtitle = isVolatile
    ? `Volatile Table \u2014 ${node.id}`
    : `Table / View \u2014 ${node.id}`;

  return (
    <>
      <ModalHeader
        title={node.label}
        subtitle={subtitle}
        onClose={onClose}
        copyText={ddl || undefined}
        onMouseDown={onHeaderMouseDown}
      />
      <div className="p-5 flex-1 min-h-0 flex flex-col overflow-hidden">
        {loading && <div className="text-gray-400 text-sm">Loading DDL...</div>}
        {error && <div className="text-red-500 text-sm">Error: {error}</div>}
        {ddl && !loading && <SqlBlock sql={ddl} preserveLines />}
      </div>
    </>
  );
}

function GenericNodeModal({ node, onClose, onHeaderMouseDown }: { node: CytoscapeNodeData } & ModalContentProps) {
  const typeLabel: Record<string, string> = {
    caller: "Called Procedure",
  };
  const detail = node.detail || {};
  const parameters = (detail.parameters || []) as Array<{
    name: string;
    data_type: string;
    direction: string;
  }>;

  return (
    <>
      <ModalHeader
        title={node.label}
        subtitle={typeLabel[node.type] || node.type}
        onClose={onClose}
        onMouseDown={onHeaderMouseDown}
      />
      <div className="p-5 overflow-auto flex-1 min-h-0">
        {node.id !== node.label && (
          <div className="text-sm text-gray-500 mb-4">{node.id}</div>
        )}
        {parameters.length > 0 && (
          <>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Parameters
            </div>
            <table className="text-xs font-mono w-full mb-4">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="py-1 pr-4">Direction</th>
                  <th className="py-1 pr-4">Name</th>
                  <th className="py-1">Type</th>
                </tr>
              </thead>
              <tbody>
                {parameters.map((p) => (
                  <tr key={p.name} className="border-b border-gray-100">
                    <td className="py-1 pr-4">{p.direction}</td>
                    <td className="py-1 pr-4">{p.name}</td>
                    <td className="py-1">{p.data_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {parameters.length === 0 && (
          <div className="text-gray-400 text-sm">No additional details available.</div>
        )}
      </div>
    </>
  );
}

function EdgeModal({ edge, onClose, onHeaderMouseDown }: { edge: CytoscapeEdgeData } & ModalContentProps) {
  const summary = `Source: ${edge.source}\nTarget: ${edge.target}\nType: ${edge.type}${edge.step ? `\nStep: ${edge.step}` : ""}`;

  return (
    <>
      <ModalHeader title={edge.label} subtitle="Edge" onClose={onClose} copyText={summary} onMouseDown={onHeaderMouseDown} />
      <div className="p-5 overflow-auto flex-1 min-h-0">
        <table className="text-sm">
          <tbody>
            <tr>
              <td className="pr-4 text-gray-400 py-1">Source</td>
              <td className="py-1">{edge.source}</td>
            </tr>
            <tr>
              <td className="pr-4 text-gray-400 py-1">Target</td>
              <td className="py-1">{edge.target}</td>
            </tr>
            <tr>
              <td className="pr-4 text-gray-400 py-1">Type</td>
              <td className="py-1 capitalize">{edge.type}</td>
            </tr>
            {edge.step && (
              <tr>
                <td className="pr-4 text-gray-400 py-1">Step</td>
                <td className="py-1">{edge.step}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
