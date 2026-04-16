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

export interface VisibilityMap {
  nodes: Record<string, boolean>;
  edges: Record<string, boolean>;
}

interface DiagramViewProps {
  graph: GraphResponse;
  onSelect: (detail: DetailSelection) => void;
  visibility: VisibilityMap;
}

const MIN_ZOOM = 0.45;

const DiagramView = forwardRef<DiagramHandle, DiagramViewProps>(function DiagramView({ graph, onSelect, visibility }, ref) {
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
            "font-size": "12px",
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
            "font-weight": "bold",
            "border-width": 2,
            "border-color": "#3B2D8F",
          },
        },
        {
          selector: "node.step",
          style: {
            "background-color": NODE_COLORS.step,
            height: "48px",
            "text-wrap": "wrap",
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
            "font-size": "10px",
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

    // Fit diagram to viewport after layout, clamping zoom so labels stay readable
    cy.one("layoutstop", () => {
      cy.fit(undefined, 30);
      if (cy.zoom() < MIN_ZOOM) {
        cy.zoom(MIN_ZOOM);
        cy.center();
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [graph]);

  // Toggle node/edge visibility, then hide orphaned nodes & dangling edges
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Pass 1 — apply direct visibility from toggles
    // Show/hide nodes by type
    for (const [nodeType, visible] of Object.entries(visibility.nodes)) {
      cy.nodes(`.${nodeType}`).style("display", visible ? "element" : "none");
    }
    // Show/hide edges by type (skip scaffold edges)
    for (const [edgeType, visible] of Object.entries(visibility.edges)) {
      cy.edges(`.${edgeType}`).not(".hidden").style("display", visible ? "element" : "none");
    }

    // Pass 2 — hide edges where either endpoint is hidden
    cy.edges().not(".hidden").forEach((edge) => {
      if (edge.style("display") === "none") return;
      const srcHidden = edge.source().style("display") === "none";
      const tgtHidden = edge.target().style("display") === "none";
      if (srcHidden || tgtHidden) {
        edge.style("display", "none");
      }
    });

    // Pass 3 — hide nodes that have no remaining visible non-hidden edges
    // (skip the root proc/macro node which should always stay visible if its type is on)
    cy.nodes().forEach((node) => {
      if (node.style("display") === "none") return;
      const nodeType = node.data("type") as string;
      if (nodeType === "proc" || nodeType === "macro") return;
      const hasVisibleEdge = node.connectedEdges().not(".hidden").some(
        (edge) => edge.style("display") !== "none",
      );
      if (!hasVisibleEdge) {
        node.style("display", "none");
      }
    });
  }, [visibility]);

  return <div ref={containerRef} className="w-full h-full" />;
});

export default DiagramView;
