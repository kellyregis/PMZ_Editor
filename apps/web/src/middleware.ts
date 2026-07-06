import { type NextRequest, NextResponse } from "next/server";

/**
 * Env-flagged SSO gate.
 *
 * When PMZ_REQUIRE_SSO === "true", every route (except the SSO/import
 * entrypoints, health, and Next internals) must carry a better-auth session
 * cookie; otherwise the visitor is redirected to the pmz-clipper app. When the
 * flag is anything else (default), this is a no-op and behaviour is unchanged —
 * so we cannot lock ourselves out before the app side is wired up.
 *
 * Note: this is a lightweight cookie-PRESENCE check (edge-safe, no DB). The
 * cookie is HMAC-signed by better-auth with BETTER_AUTH_SECRET, so it cannot be
 * forged without the secret. Full session validation (expiry/revocation) still
 * happens wherever `auth.api.getSession` is called (e.g. /api/import/clip-data).
 */

const PUBLIC_PREFIXES = [
	"/api/auth", // SSO bridge + better-auth handler
	"/api/import", // server-to-server clip-data proxy (guards itself via getSession)
	"/import", // client import page (reached right after the SSO bridge sets the cookie)
	"/api/health",
	"/_next",
	"/favicon",
];

// better-auth names the session cookie "__Secure-better-auth.session_token" on
// HTTPS (secure cookies) and "better-auth.session_token" otherwise.
const SESSION_COOKIE_NAMES = [
	"__Secure-better-auth.session_token",
	"better-auth.session_token",
];

export function middleware(request: NextRequest): NextResponse {
	if (process.env.PMZ_REQUIRE_SSO !== "true") {
		return NextResponse.next();
	}

	const { pathname } = request.nextUrl;

	if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
		return NextResponse.next();
	}

	const hasSession = SESSION_COOKIE_NAMES.some((name) =>
		request.cookies.has(name),
	);
	if (hasSession) {
		return NextResponse.next();
	}

	const appUrl =
		process.env.PMZ_APP_URL || "https://pmzclips.pandoramodz.com.br";
	return NextResponse.redirect(appUrl);
}

export const config = {
	// Skip static assets; run on everything else (the flag gates behaviour).
	matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
