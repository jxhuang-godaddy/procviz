import { useEffect, useRef } from "react";
import cytoscape, { type Core, type EventObject } from "cytoscape";
import dagre from "cytoscape-dagre";
import type { GraphResponse, CytoscapeNodeData, CytoscapeEdgeData } from "../types/graph";

// Register dagre layout once
cytoscape.use(dagre);

const NODE_COLORS: Record<string, string> = {
  proc: "#534AB7",
  macro: "#534AB7",
  table: "#0F6E56",
  caller: "#888888",
};

const EDGE_COLORS: Record<string, string> = {
  read: "#1D9E75",
  write: "#534AB7",
  call: "#888888",
};

interface DiagramViewProps {
  graph: GraphResponse;
  onSelectNode: (node: CytoscapeNodeData | null) => void;
  onSelectEdge: (edge: CytoscapeEdgeData | null) => void;
}

export default function DiagramView({ graph, onSelectNode, onSelectEdge }: DiagramViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const elements = [
      ...graph.nodes.map((n) => ({
        data: { ...n },
        classes: n.type,
      })),
      ...graph.edges.map((e, i) => ({
        data: { ...e, id: `edge-${i}` },
        classes: e.type,
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            color: "#fff",
            "font-size": "11px",
            "text-wrap": "wrap",
            "text-max-width": "100px",
            width: "120px",
            height: "40px",
            shape: "roundrectangle",
            "background-color": "#888",
          },
        },
        ...Object.entries(NODE_COLORS).map(([type, color]) => ({
          selector: `node.${type}`,
          style: { "background-color": color },
        })),
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
            width: 2,
            "line-color": "#ccc",
            "target-arrow-color": "#ccc",
          },
        },
        ...Object.entries(EDGE_COLORS).map(([type, color]) => ({
          selector: `edge.${type}`,
          style: {
            "line-color": color,
            "target-arrow-color": color,
            color: color,
            ...(type === "call" ? { "line-style": "dashed" } : {}),
          },
        })),
      ],
      layout: {
        name: "dagre",
        rankDir: "LR",
        nodeSep: 60,
        rankSep: 120,
        padding: 40,
      } as any,
    });

    cy.on("tap", "node", (evt: EventObject) => {
      onSelectNode(evt.target.data() as CytoscapeNodeData);
      onSelectEdge(null);
    });

    cy.on("tap", "edge", (evt: EventObject) => {
      onSelectEdge(evt.target.data() as CytoscapeEdgeData);
      onSelectNode(null);
    });

    cy.on("tap", (evt: EventObject) => {
      if (evt.target === cy) {
        onSelectNode(null);
        onSelectEdge(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [graph, onSelectNode, onSelectEdge]);

  return <div ref={containerRef} className="w-full h-full" />;
}
