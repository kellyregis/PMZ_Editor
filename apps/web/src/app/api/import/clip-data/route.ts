import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/server";
import { webEnv } from "@/env/web";

// Node runtime: reads the better-auth session + calls the clipper API with the
// server-only shared secret (must never reach the browser).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-to-server proxy that fetches clip/merge data from the pmz-clipper
 * backend for the authenticated user. The shared PMZ_SSO_SECRET bearer stays
 * server-side; the browser import page calls THIS route (same-origin, session
 * cookie) and never sees the secret. Presigned media URLs in the response are
 * fetched directly by the browser afterwards.
 *
 * Clipper contract (implemented on the app side):
 *   GET {PMZ_CLIPPER_API}/editor/clip-data/{id}?kind=clip|merge
 *   Authorization: Bearer {PMZ_SSO_SECRET}
 *   -> { title, video_url, duration_s, captions:[{text,start,duration}], music_url? }
 */
export async function GET(request: NextRequest) {
	// Require a valid better-auth session (the SSO bridge set it).
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	const secret = webEnv.PMZ_SSO_SECRET;
	if (!secret) {
		return NextResponse.json(
			{ error: "SSO is not configured (PMZ_SSO_SECRET missing)" },
			{ status: 501 },
		);
	}

	const clipId = request.nextUrl.searchParams.get("clip_id");
	const kindParam = request.nextUrl.searchParams.get("kind");
	const kind = kindParam === "merge" ? "merge" : "clip";
	if (!clipId) {
		return NextResponse.json({ error: "Missing clip_id" }, { status: 400 });
	}

	const url = `${webEnv.PMZ_CLIPPER_API}/editor/clip-data/${encodeURIComponent(
		clipId,
	)}?kind=${kind}`;

	try {
		const upstream = await fetch(url, {
			headers: {
				Authorization: `Bearer ${secret}`,
				// Forward the resolved identity so the clipper can authorize which
				// user may open which clip (defence against IDOR; optional on the
				// clipper side).
				"X-PMZ-User": session.user.email ?? session.user.id,
			},
			cache: "no-store",
		});

		if (!upstream.ok) {
			const text = await upstream.text().catch(() => "");
			console.error("clip-data upstream error", upstream.status, text);
			return NextResponse.json(
				{ error: "Failed to fetch clip data" },
				{ status: upstream.status },
			);
		}

		const data = await upstream.json();
		return NextResponse.json(data);
	} catch (error) {
		console.error("clip-data fetch threw:", error);
		return NextResponse.json(
			{ error: "Internal error fetching clip data" },
			{ status: 502 },
		);
	}
}
