/**
 * Find the picnic-web route for a path and call it the way Next.js would.
 */
import type { NextRequest, NextResponse } from "next/server";

type Handler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => Promise<NextResponse<unknown>> | NextResponse<unknown>;

export type RouteModule = Partial<Record<"GET" | "POST" | "PUT" | "DELETE" | "PATCH", Handler>>;

export type RouteEntry = { path: string; methods: string[]; module: RouteModule };

type Compiled = RouteEntry & { segments: string[]; dynamic: number };

export type Match =
  | { kind: "found"; entry: RouteEntry; handler: Handler; params: Record<string, string> }
  | { kind: "method"; allowed: string[] }
  | { kind: "none" };

export class Router {
  readonly #routes: Compiled[];

  constructor(routes: RouteEntry[]) {
    // Fixed segments win over [params], as in Next.js: /recipe/saved is not /recipe/[id].
    this.#routes = routes
      .map((route) => {
        const segments = route.path.split("/");
        return { ...route, segments, dynamic: segments.filter((s) => s.startsWith("[")).length };
      })
      .sort((a, b) => a.dynamic - b.dynamic || b.segments.length - a.segments.length);
  }

  /** `path` is what follows /api/, already split on "/" and percent-decoded per segment. */
  match(method: string, segments: string[]): Match {
    for (const route of this.#routes) {
      if (route.segments.length !== segments.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < segments.length; i++) {
        const pattern = route.segments[i];
        if (pattern.startsWith("[") && pattern.endsWith("]")) {
          if (!segments[i]) {
            ok = false;
            break;
          }
          params[pattern.slice(1, -1)] = segments[i];
        } else if (pattern !== segments[i]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const handler = route.module[method as keyof RouteModule];
      if (!handler) return { kind: "method", allowed: route.methods };
      return { kind: "found", entry: route, handler, params };
    }
    return { kind: "none" };
  }
}
