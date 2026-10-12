import { useEffect, useMemo, useRef, useState } from "react";
import { getVoltageMagnitude, voltageState } from "../utils/scada.js";

const nodeFill = {
  unknown: "#94a3b8",
  normal: "#16a34a",
  warning: "#f59e0b",
  alarm: "#dc2626",
};

function buildLayout(nodes, edges) {
  const drawable = nodes.filter((node) => node.kind === "bus" || node.kind === "open-switch-end");
  const drawableIds = new Set(drawable.map((node) => node.id));
  const adjacency = new Map(drawable.map((node) => [node.id, []]));

  edges.forEach((edge) => {
    if (drawableIds.has(edge.from) && drawableIds.has(edge.to)) {
      adjacency.get(edge.from).push(edge.to);
      adjacency.get(edge.to).push(edge.from);
    }
  });

  const root = drawableIds.has("150") ? "150" : drawable[0]?.id;
  const visited = new Set([root]);
  const levels = [[root]];
  const queue = [{ id: root, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();

    adjacency.get(current.id).forEach((next) => {
      if (!visited.has(next)) {
        visited.add(next);
        levels[current.depth + 1] ??= [];
        levels[current.depth + 1].push(next);
        queue.push({ id: next, depth: current.depth + 1 });
      }
    });
  }

  drawable.forEach((node) => {
    if (!visited.has(node.id)) {
      levels[levels.length] = [node.id];
    }
  });

  const positions = new Map();
  const xGap = 92;
  const yGap = 42;

  levels.forEach((level, depth) => {
    const height = (level.length - 1) * yGap;
    level.forEach((id, index) => {
      positions.set(id, {
        x: depth * xGap,
        y: index * yGap - height / 2,
      });
    });
  });

  const xs = [...positions.values()].map((position) => position.x);
  const ys = [...positions.values()].map((position) => position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  positions.forEach((position, id) => {
    positions.set(id, {
      x: position.x - minX + 48,
      y: position.y - minY + 48,
    });
  });

  return positions;
}

function edgeLabel(edge) {
  if (edge.type === "regulator") {
    return `RG${edge.id}`;
  }

  if (edge.from === "61" && edge.to === "610") {
    return "XF1";
  }

  return "";
}

function FeederGraph({ topology, latestByBus, selectedBus, onSelectBus }) {
  const [view, setView] = useState({ x: 0, y: 0, scale: 0.72 });
  const [drag, setDrag] = useState(null);
  const graphRef = useRef(null);
  const positions = useMemo(() => buildLayout(topology.nodes, topology.edges), [topology]);
  const drawableNodes = topology.nodes.filter((node) => node.kind === "bus" || node.kind === "open-switch-end");
  const drawableIds = new Set(drawableNodes.map((node) => node.id));
  const drawableEdges = topology.edges.filter((edge) => drawableIds.has(edge.from) && drawableIds.has(edge.to));
  const width = Math.max(...[...positions.values()].map((position) => position.x)) + 80;
  const height = Math.max(...[...positions.values()].map((position) => position.y)) + 80;

  useEffect(() => {
    const graph = graphRef.current;

    if (!graph) {
      return;
    }

    const onWheel = (event) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      setView((current) => ({
        ...current,
        scale: Math.min(1.8, Math.max(0.35, current.scale + direction * 0.08)),
      }));
    };

    graph.addEventListener("wheel", onWheel, { passive: false });
    return () => graph.removeEventListener("wheel", onWheel);
  }, []);

  const startDrag = (event) => {
    if (event.button !== 0) {
      return;
    }

    setDrag({ x: event.clientX, y: event.clientY, view });
  };

  const moveDrag = (event) => {
    if (!drag) {
      return;
    }

    setView({
      ...drag.view,
      x: drag.view.x + event.clientX - drag.x,
      y: drag.view.y + event.clientY - drag.y,
    });
  };

  return (
    <section className="flex min-h-[620px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-950">IEEE 123-node feeder, 4.16 kV</h1>
          <p className="mt-1 text-sm text-slate-500">123 buses shown from {topology.nodes.length} topology entries</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-600" />Normal</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Near limit</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-600" />Alarm</span>
        </div>
      </div>

      <div
        ref={graphRef}
        className="relative flex-1 cursor-grab overflow-hidden bg-slate-50 active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <svg className="h-full w-full" role="img" aria-label="Virtual feeder graph">
          <g transform={`translate(${view.x + 24} ${view.y + 18}) scale(${view.scale})`}>
            <rect x="0" y="0" width={width} height={height} fill="transparent" />
            {drawableEdges.map((edge, index) => {
              const from = positions.get(edge.from);
              const to = positions.get(edge.to);
              const label = edgeLabel(edge);

              if (!from || !to) {
                return null;
              }

              return (
                <g key={`${edge.from}-${edge.to}-${edge.type}-${index}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={edge.type === "switch" ? "#64748b" : "#94a3b8"}
                    strokeWidth={edge.type === "regulator" ? 2.4 : 1.5}
                    strokeDasharray={edge.type === "switch" && edge.normal === "open" ? "7 6" : undefined}
                  />
                  {label && (
                    <g transform={`translate(${(from.x + to.x) / 2} ${(from.y + to.y) / 2})`}>
                      <rect x="-15" y="-10" width="30" height="20" rx="4" fill="#e0f2fe" stroke="#0284c7" />
                      <text textAnchor="middle" dominantBaseline="central" className="fill-sky-800 text-[10px] font-bold">
                        {label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {drawableNodes.map((node) => {
              const position = positions.get(node.id);
              const latest = latestByBus.get(node.id);
              const value = getVoltageMagnitude(latest, node.phases);
              const state = node.kind === "open-switch-end" ? "unknown" : voltageState(value);
              const isSelected = selectedBus === node.id;
              const isSubstation = node.id === "150";

              if (!position) {
                return null;
              }

              return (
                <g
                  key={node.id}
                  transform={`translate(${position.x} ${position.y})`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => node.kind === "bus" && onSelectBus(node.id)}
                  className={node.kind === "bus" ? "cursor-pointer" : ""}
                >
                  {isSubstation ? (
                    <rect
                      x="-9"
                      y="-9"
                      width="18"
                      height="18"
                      rx="3"
                      fill="#0f172a"
                      stroke={isSelected ? "#2563eb" : "#ffffff"}
                      strokeWidth={isSelected ? 4 : 2}
                    />
                  ) : (
                    <circle
                      r={node.kind === "open-switch-end" ? 4 : 6}
                      fill={nodeFill[state]}
                      stroke={isSelected ? "#2563eb" : "#ffffff"}
                      strokeWidth={isSelected ? 4 : 1.5}
                    />
                  )}
                  {(isSubstation || isSelected || node.kind === "open-switch-end") && (
                    <text x="10" y="-8" className="select-none fill-slate-700 text-[10px] font-semibold">
                      {isSubstation ? "Substation 150" : node.id}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute bottom-3 left-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
          Wheel to zoom, drag to pan, click a bus to select it.
        </div>
      </div>
    </section>
  );
}

export default FeederGraph;
