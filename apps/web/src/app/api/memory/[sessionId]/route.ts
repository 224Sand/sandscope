/** Session memory, proxied from the runtime (FR-008).
 *
 * The runtime has served this since Sprint 3 and nothing ever asked for it:
 * `recall()` is written, indexed and tested, and the console had no way to
 * show a visitor what the agent remembers about their session. "Visible to the
 * user" was the half of the requirement that did not exist.
 *
 * The session id is a cookie-scoped value the browser already holds, and it is
 * demo-grade identity rather than authentication — the threat model says so
 * plainly. It is length-capped and character-restricted here anyway: it lands
 * in an upstream URL path, and a value carrying `../` or a newline is a
 * request-smuggling shape rather than a session.
 */
import { NextResponse } from "next/server";

import { agentServiceToken, agentServiceUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Matches the runtime's own `session_id` bound: max_length 64. Anything
 *  outside [A-Za-z0-9_-] cannot be a session this app issued. */
const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await context.params;

  if (!SESSION_ID.test(sessionId)) {
    return NextResponse.json(
      { error: "invalid_session", detail: "session id must be 1-64 of [A-Za-z0-9_-]" },
      { status: 422 },
    );
  }

  try {
    const upstream = await fetch(
      `${agentServiceUrl()}/v1/sessions/${encodeURIComponent(sessionId)}/memory`,
      {
        headers: { Authorization: `Bearer ${agentServiceToken()}` },
        cache: "no-store",
      },
    );
    if (!upstream.ok) {
      return NextResponse.json({ error: "runtime_error", status: upstream.status }, { status: 502 });
    }
    return NextResponse.json(await upstream.json());
  } catch (error) {
    // The runtime sleeps on the free tier (R-01). Memory being unavailable is
    // an expected state, and an empty panel that says why beats one that
    // silently shows nothing.
    return NextResponse.json(
      { error: "runtime_unreachable", detail: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
