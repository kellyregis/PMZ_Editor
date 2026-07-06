import { type NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { auth } from "@/auth/server";
import { webEnv } from "@/env/web";

// Node runtime: needs DB (better-auth) + Web Crypto.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSO bridge for pmz-clipper.
 *
 * Flow: pmz-clipper mints a short-lived HS256 JWT signed with the shared
 * PMZ_SSO_SECRET and sends the user to `/api/auth/sso?token=<jwt>`. We verify
 * the token, upsert the user, create a better-auth session (Set-Cookie), then
 * redirect: to `/import` when a clip/merge is attached, otherwise `/projects`.
 *
 * Expected JWT claims:
 *   { type: "editor_sso", email, sub, clip_id?, kind?: "clip"|"merge",
 *     exp (~5min), jti }
 *
 * Session creation uses ONLY better-auth's public API (signIn/signUp with a
 * password deterministically derived from the shared secret) so better-auth
 * itself handles the session row + correctly-signed session cookie. We never
 * expose that password; it is HMAC(secret, email) and stable across logins.
 */

async function derivePassword({
	secret,
	email,
}: {
	secret: string;
	email: string;
}): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`sso-password:${email.toLowerCase()}`),
	);
	// hex, 64 chars — satisfies better-auth's min length; prefix guarantees a
	// non-empty, policy-safe value.
	const hex = Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `Pmz1!${hex}`;
}

function appRedirect(): NextResponse {
	return NextResponse.redirect(webEnv.PMZ_APP_URL);
}

export async function GET(request: NextRequest) {
	const secret = webEnv.PMZ_SSO_SECRET;
	if (!secret) {
		return NextResponse.json(
			{ error: "SSO is not configured (PMZ_SSO_SECRET missing)" },
			{ status: 501 },
		);
	}

	const token = request.nextUrl.searchParams.get("token");
	if (!token) return appRedirect();

	// 1. Verify the JWT (jose checks exp automatically).
	let email: string;
	let clipId: string | null = null;
	let kind = "clip";
	try {
		const { payload } = await jwtVerify(
			token,
			new TextEncoder().encode(secret),
			{ algorithms: ["HS256"] },
		);
		if (payload.type !== "editor_sso" || typeof payload.email !== "string") {
			return appRedirect();
		}
		email = payload.email;
		if (typeof payload.clip_id === "string") clipId = payload.clip_id;
		if (payload.kind === "merge" || payload.kind === "clip") {
			kind = payload.kind;
		}
	} catch (error) {
		console.error("SSO token verification failed:", error);
		return appRedirect();
	}

	// 2. Upsert user + create session via better-auth's public API.
	const password = await derivePassword({ secret, email });
	const name =
		email.split("@")[0]?.replace(/[^a-zA-Z0-9._-]/g, "") || "PMZ User";

	let authResponse: Response | null = null;
	try {
		authResponse = await auth.api.signInEmail({
			body: { email, password },
			asResponse: true,
		});
	} catch (error) {
		console.error("SSO signIn threw:", error);
		authResponse = null;
	}

	if (!authResponse || !authResponse.ok) {
		try {
			authResponse = await auth.api.signUpEmail({
				body: { email, password, name },
				asResponse: true,
			});
		} catch (error) {
			console.error("SSO signUp threw:", error);
			authResponse = null;
		}
	}

	if (!authResponse || !authResponse.ok) {
		console.error(
			"SSO could not establish a session for",
			email,
			authResponse?.status,
		);
		return appRedirect();
	}

	// 3. Build the destination redirect and forward better-auth's Set-Cookie(s).
	const dest = clipId
		? new URL(
				`/import?clip_id=${encodeURIComponent(clipId)}&kind=${encodeURIComponent(kind)}`,
				webEnv.NEXT_PUBLIC_SITE_URL,
			)
		: new URL("/projects", webEnv.NEXT_PUBLIC_SITE_URL);

	const response = NextResponse.redirect(dest);
	for (const cookie of authResponse.headers.getSetCookie()) {
		response.headers.append("set-cookie", cookie);
	}
	return response;
}
