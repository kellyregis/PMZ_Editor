import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/server";
import { webEnv } from "@/env/web";

// Node runtime: reads the better-auth session + calls the clipper AI endpoint
// with the server-only shared secret.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI proxy. The browser (AIView) builds the scene snapshot and POSTs
 * { prompt, scene, target_lang? } here; we authenticate the session and forward
 * it server-to-server to the clipper's Gemini pipeline, keeping PMZ_SSO_SECRET
 * off the client.
 *
 * Clipper contract (app side): POST {PMZ_CLIPPER_API}/editor/ai
 *   Authorization: Bearer {PMZ_SSO_SECRET}
 *   body: { prompt, scene, target_lang? }
 *   -> { message, operations: AiOperation[] }
 */
export async function POST(request: NextRequest) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	const secret = webEnv.PMZ_SSO_SECRET;
	if (!secret) {
		return NextResponse.json(
			{ error: "AI is not configured (PMZ_SSO_SECRET missing)" },
			{ status: 501 },
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}

	try {
		const upstream = await fetch(`${webEnv.PMZ_CLIPPER_API}/editor/ai`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				Authorization: `Bearer ${secret}`,
				"X-PMZ-User": session.user.email ?? session.user.id,
			},
			body: JSON.stringify(body),
			cache: "no-store",
		});

		if (!upstream.ok) {
			const text = await upstream.text().catch(() => "");
			console.error("ai upstream error", upstream.status, text);
			return NextResponse.json(
				{ error: "AI request failed" },
				{ status: upstream.status },
			);
		}

		const data = await upstream.json();
		return NextResponse.json(data);
	} catch (error) {
		console.error("ai route threw:", error);
		return NextResponse.json({ error: "Internal error" }, { status: 502 });
	}
}
