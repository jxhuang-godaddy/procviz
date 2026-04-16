import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import cytoscape, { type Core, type EventObject } from "cytoscape";
import dagre from "cytoscape-dagre";
import type { GraphResponse, CytoscapeNodeData, CytoscapeEdgeData } from "../types/graph";
import type { DetailSelection } from "../App";

// Register dagre layout once
cytoscape.use(dagre);

const NODE_COLORS: Record<string, string> = {
  proc: "#534AB7",
  macro: "#534AB7",
  step: "#3B82F6",
  table: "#0F6E56",
  volatile: "#D97706",
  caller: "#888888",
};

const EDGE_COLORS: Record<string, string> = {
  read: "#1D9E75",
  write: "#534AB7",
  call: "#94A3B8",
};

export interface DiagramHandle {
  getCy: () => Core | null;
}

interface DiagramViewProps {
  graph: GraphResponse;
  onSelect: (detail: DetailSelection) => void;
}

const DiagramView = forwardRef<DiagramHandle, DiagramViewProps>(function DiagramView({ graph, onSelect }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useImperativeHandle(ref, () => ({ getCy: () => cyRef.current }));

  useEffect(() => {
    if (!containerRef.current) return;

    const elements = [
      ...graph.nodes.map((n) => ({
        data: { ...n },
        classes: n.type,
      })),
      ...graph.edges.map((e, i) => ({
        data: { ...e, id: `edge-${i}` },
        classes: [e.type, e.hidden ? "hidden" : ""].filter(Boolean).join(" "),
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // --- Node defaults ---
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            color: "#fff",
            "font-size": "11px",
            width: "label",
            height: "40px",
            "padding-left": "14px",
            "padding-right": "14px",
            shape: "roundrectangle",
            "background-color": "#888",
          } as any,
        },
        {
          selector: "node.proc, node.macro",
          style: {
            "background-color": NODE_COLORS.proc,
            height: "44px",
            "font-size": "12px",
            "font-weight": "bold",
            "border-width": 2,
            "border-color": "#3B2D8F",
          },
        },
        {
          selector: "node.step",
          style: {
            "background-color": NODE_COLORS.step,
            height: "36px",
            "font-size": "10px",
            "border-width": 1,
            "border-color": "#2563EB",
          },
        },
        {
          selector: "node.table",
          style: { "background-color": NODE_COLORS.table },
        },
        {
          selector: "node.volatile",
          style: {
            "background-color": NODE_COLORS.volatile,
            "border-width": 1,
            "border-style": "dashed",
            "border-color": "#B45309",
          },
        },
        {
          selector: "node.caller",
          style: { "background-color": NODE_COLORS.caller },
        },
        // --- Edge defaults ---
        {
          selector: "edge",
          style: {
            label: "data(label)",
            "font-size": "9px",
            "text-rotation": "autorotate",
            "text-margin-y": -10,
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.8,
            width: 1.5,
            "line-color": "#ccc",
            "target-arrow-color": "#ccc",
          },
        },
        {
          selector: "edge.read",
          style: {
            "line-color": EDGE_COLORS.read,
            "target-arrow-color": EDGE_COLORS.read,
            color: EDGE_COLORS.read,
          },
        },
        {
          selector: "edge.write",
          style: {
            "line-color": EDGE_COLORS.write,
            "target-arrow-color": EDGE_COLORS.write,
            color: EDGE_COLORS.write,
          },
        },
        {
          selector: "edge.call",
          style: {
            "line-color": EDGE_COLORS.call,
            "target-arrow-color": EDGE_COLORS.call,
            color: EDGE_COLORS.call,
            "line-style": "dashed",
          },
        },
        // Hidden scaffold edges — invisible but still affect dagre layout
        {
          selector: "edge.hidden",
          style: {
            opacity: 0,
            width: 0,
            "target-arrow-shape": "none",
            label: "",
          },
        },
      ],
      layout: {
        name: "dagre",
        rankDir: "LR",
        nodeSep: 30,
        rankSep: 100,
        padding: 30,
      } as any,
    });

    cy.on("tap", "node", (evt: EventObject) => {
      onSelectRef.current({ kind: "node", data: evt.target.data() as CytoscapeNodeData });
    });

    cy.on("tap", "edge", (evt: EventObject) => {
      if (evt.target.data("hidden")) return;
      onSelectRef.current({ kind: "edge", data: evt.target.data() as CytoscapeEdgeData });
    });

    cy.on("tap", (evt: EventObject) => {
      if (evt.target === cy) {
        onSelectRef.current(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [graph]);

  return <div ref={containerRef} className="w-full h-full" />;
});

export default DiagramView;
