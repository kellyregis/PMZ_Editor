import { z } from "zod";

const webEnvSchema = z.object({
	// Node
	NODE_ENV: z.enum(["development", "production", "test"]),
	ANALYZE: z.string().optional(),
	NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

	// Public
	NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
	NEXT_PUBLIC_MARBLE_API_URL: z.url(),

	// Server
	DATABASE_URL: z.string().refine(
		(url) =>
			url.startsWith("postgres://") || url.startsWith("postgresql://"),
		"DATABASE_URL must be a postgres:// or postgresql:// URL",
	),

	BETTER_AUTH_SECRET: z.string(),
	UPSTASH_REDIS_REST_URL: z.url(),
	UPSTASH_REDIS_REST_TOKEN: z.string(),
	MARBLE_WORKSPACE_KEY: z.string(),
	FREESOUND_CLIENT_ID: z.string(),
	FREESOUND_API_KEY: z.string(),

	// --- pmz-clipper integration (all optional; SSO stays off until set) ---
	// HS256 shared secret used to (a) verify the SSO JWT and (b) authorize the
	// server-to-server clip-data call. If absent, the SSO bridge returns 501.
	PMZ_SSO_SECRET: z.string().optional(),
	// When "true", middleware requires a better-auth session on every route
	// (except the SSO/import entrypoints + statics) and bounces others to the
	// pmz-clipper app. Default off so we cannot lock ourselves out.
	PMZ_REQUIRE_SSO: z.string().optional().default("false"),
	// Base URL of the pmz-clipper backend API (clip-data endpoint lives here).
	PMZ_CLIPPER_API: z
		.string()
		.optional()
		.default("https://api.pmzclips.pandoramodz.com.br"),
	// Public URL of the pmz-clipper app (redirect target for unauthenticated
	// users / invalid tokens).
	PMZ_APP_URL: z
		.string()
		.optional()
		.default("https://pmzclips.pandoramodz.com.br"),
	// Storage mode (build-time, client-inlined). "backend" persists projects +
	// media to the pmz-clipper backend; anything else (default) = local
	// IndexedDB/OPFS. See services/storage/backend-config.ts.
	NEXT_PUBLIC_STORAGE_BACKEND: z.string().optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export const webEnv = webEnvSchema.parse(process.env);
