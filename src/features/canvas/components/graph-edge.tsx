"use client";
import { memo, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useStore,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { Point } from "../types";
export type RoutedEdge = Edge<
  {
    points: Point[];
    shortLabel: string;
    dense: boolean;
    labelPoint?: Point;
    selectedElsewhere?: boolean;
  },
  "architecture"
>;
export const GraphEdge = memo(function GraphEdge(props: EdgeProps<RoutedEdge>) {
  const [hover, setHover] = useState(false);
  const detailed = useStore((state) => state.transform[2] >= 0.7);
  const points = props.data?.points;
  const route =
    points && points.length > 1
      ? [
          { x: props.sourceX, y: props.sourceY },
          ...points.slice(1, -1),
          { x: props.targetX, y: props.targetY },
        ]
      : null;
  const path = route
    ? route.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ")
    : getSmoothStepPath(props)[0];
  const middle = props.data?.labelPoint ??
    route?.[Math.floor(route.length / 2)] ?? {
      x: (props.sourceX + props.targetX) / 2,
      y: (props.sourceY + props.targetY) / 2,
    };
  return (
    <g onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={24}
      />
      {(props.selected ||
        (hover && detailed && !props.data?.selectedElsewhere)) && (
        <EdgeLabelRenderer>
          <div
            className="canvas-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%,-50%) translate(${middle.x}px,${middle.y}px)`,
            }}
            title={String(props.label)}
          >
            {props.data?.shortLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
});
