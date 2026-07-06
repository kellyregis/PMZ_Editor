import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/server";
import { webEnv } from "@/env/web";

// Node runtime: validates the better-auth session and forwards to the clipper
// backend with the server-only bearer secret (never exposed to the browser).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin proxy for backend storage. The client-side BackendStorageAdapter
 * and media helpers call /api/editor-storage/*; we authenticate the session,
 * resolve the user email, and forward to ${PMZ_CLIPPER_API}/editor/* with
 * Authorization: Bearer ${PMZ_SSO_SECRET} + X-PMZ-User.
 *
 * Handles projects (JSON) and media (multipart) transparently by streaming the
 * raw body through with its original content-type.
 */
async function proxy(
	request: NextRequest,
	path: string[],
): Promise<NextResponse> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	const secret = webEnv.PMZ_SSO_SECRET;
	if (!secret) {
		return NextResponse.json(
			{ error: "Backend storage not configured (PMZ_SSO_SECRET missing)" },
			{ status: 501 },
		);
	}

	const subPath = path.map((segment) => encodeURIComponent(segment)).join("/");
	const search = request.nextUrl.search;
	const url = `${webEnv.PMZ_CLIPPER_API}/editor/${subPath}${search}`;

	const headers: Record<string, string> = {
		Authorization: `Bearer ${secret}`,
		"X-PMZ-User": session.user.email ?? session.user.id,
	};

	const method = request.method;
	let body: ArrayBuffer | undefined;
	if (method !== "GET" && method !== "HEAD" && method !== "DELETE") {
		const contentType = request.headers.get("content-type");
		if (contentType) headers["content-type"] = contentType;
		body = await request.arrayBuffer();
	}

	try {
		const upstream = await fetch(url, {
			method,
			headers,
			body,
			cache: "no-store",
		});
		const respBody = await upstream.arrayBuffer();
		const response = new NextResponse(respBody, { status: upstream.status });
		const contentType = upstream.headers.get("content-type");
		if (contentType) response.headers.set("content-type", contentType);
		return response;
	} catch (error) {
		console.error("editor-storage proxy error:", error);
		return NextResponse.json({ error: "Upstream error" }, { status: 502 });
	}
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
	const { path } = await context.params;
	return proxy(request, path ?? []);
}

export async function POST(request: NextRequest, context: RouteContext) {
	const { path } = await context.params;
	return proxy(request, path ?? []);
}

export async function PUT(request: NextRequest, context: RouteContext) {
	const { path } = await context.params;
	return proxy(request, path ?? []);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
	const { path } = await context.params;
	return proxy(request, path ?? []);
}
