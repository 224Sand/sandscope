import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every arrow in the request-path diagram must start and end on a box.
 *
 * The map shipped for six sprints with an arrow pointing at Upstash whose
 * TAIL was in empty space -- there was no node on that side that talks to it,
 * because the only caller is the edge rate limiter, which sits in a different
 * column. A second edge left the Provider chain for Neon, and the provider
 * chain never opens a database connection.
 *
 * Neither is the kind of defect a type checker, a build, or a screenshot diff
 * catches: the SVG is perfectly valid and renders without complaint. It is
 * wrong about the system, which is the only thing that matters in a diagram
 * offered as evidence. So the geometry is asserted against the node table
 * rather than looked at.
 *
 * Read from source rather than from a render: the numbers ARE the claim, and
 * parsing them is what lets a dangling coordinate fail a test instead of
 * needing someone to notice it.
 */

const SOURCE = readFileSync(resolve(import.meta.dirname, "./SystemMap.tsx"), "utf8");
const NODE_HEIGHT = 44;

type Box = { id: string; x: number; y: number; w: number };

function nodes(): Box[] {
  const found = [
    ...SOURCE.matchAll(
      /id: "(\w+)",(?:\s*\/\/[^\n]*\n)*\s*x: (\d+), y: (\d+), w: (\d+)/g,
    ),
  ];
  return found.map(([, id, x, y, w]) => ({
    id: id!,
    x: Number(x),
    y: Number(y),
    w: Number(w),
  }));
}

/** The node a coordinate lands on, allowing for the arrowhead's own length. */
function nodeAt(boxes: Box[], x: number, y: number, pad: number): Box | undefined {
  return boxes.find(
    (b) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + NODE_HEIGHT + pad,
  );
}

/** The straight edges, which are declared as [x1, y1, x2, y2] tuples. */
function straightEdges(): number[][] {
  const before = SOURCE.split("{NODES.map")[0] ?? "";
  return [...before.matchAll(/\[(\d+), (\d+), (\d+), (\d+)\]/g)].map((m) =>
    m.slice(1).map(Number),
  );
}

/**
 * The routed edges. The marker definition in <defs> is a path too and is not
 * an edge, so it is excluded by requiring an absolute M command with a
 * multi-segment L chain -- the marker is `M0 0 L8 4 L0 8 z`, drawn in its own
 * 8x8 coordinate system.
 */
function routedEdges(): { from: [number, number]; to: [number, number] }[] {
  return [...SOURCE.matchAll(/<path d="(M[\d ]+(?:L[\d ]+)+)"/g)]
    .map((m) => [...m[1]!.matchAll(/(\d+) (\d+)/g)].map((p) => [Number(p[1]), Number(p[2])] as [number, number]))
    .filter((points) => points.length >= 3 && points.some(([x, y]) => x > 8 || y > 8))
    .map((points) => ({ from: points[0]!, to: points[points.length - 1]! }));
}

describe("the request-path diagram", () => {
  const boxes = nodes();

  it("declares every node the map draws", () => {
    expect(boxes.length).toBe(10);
    expect(boxes.map((b) => b.id)).toContain("upstash");
  });

  it("has no node overlapping another", () => {
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlaps =
          a.x < b.x + b.w &&
          b.x < a.x + a.w &&
          a.y < b.y + NODE_HEIGHT &&
          b.y < a.y + NODE_HEIGHT;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("starts and ends every straight edge on a node", () => {
    for (const [x1, y1, x2, y2] of straightEdges()) {
      expect(nodeAt(boxes, x1!, y1!, 2), `edge from (${x1},${y1}) starts nowhere`).toBeDefined();
      expect(nodeAt(boxes, x2!, y2!, 2), `edge to (${x2},${y2}) ends nowhere`).toBeDefined();
    }
  });

  it("starts and ends every routed edge on a node", () => {
    const routed = routedEdges();
    expect(routed.length).toBeGreaterThan(0);
    for (const { from, to } of routed) {
      expect(nodeAt(boxes, from[0], from[1], 14), `path from (${from}) starts nowhere`).toBeDefined();
      expect(nodeAt(boxes, to[0], to[1], 14), `path to (${to}) ends nowhere`).toBeDefined();
    }
  });

  /**
   * Guard of the guard (Definition of Done item 9). A check nobody has watched
   * fail is a check nobody knows works -- and the ORIGINAL defect was an edge
   * ending on a node with nothing at its tail, so the tail is what this proves
   * is actually tested.
   */
  it("fails on an edge whose tail is in empty space", () => {
    const dangling = nodeAt(boxes, 670, 172, 2);
    expect(dangling, "the coordinate the removed Upstash arrow started from").toBeUndefined();
  });

  it("does not claim the provider chain reaches the database", () => {
    const providers = boxes.find((b) => b.id === "providers")!;
    for (const { from } of routedEdges()) {
      const start = nodeAt(boxes, from[0], from[1], 14);
      expect(start?.id, "an edge leaves the provider chain; it opens no connection").not.toBe(
        providers.id,
      );
    }
  });
});
