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
	DATABASE_URL: z
		.string()
		.startsWith("postgres://")
		.or(z.string().startsWith("postgresql://")),

	BETTER_AUTH_SECRET: z.string(),
	UPSTASH_REDIS_REST_URL: z.url(),
	UPSTASH_REDIS_REST_TOKEN: z.string(),
	MARBLE_WORKSPACE_KEY: z.string(),
	FREESOUND_CLIENT_ID: z.string(),
	FREESOUND_API_KEY: z.string(),
	CLOUDFLARE_ACCOUNT_ID: z.string(),
	R2_ACCESS_KEY_ID: z.string(),
	R2_SECRET_ACCESS_KEY: z.string(),
	R2_BUCKET_NAME: z.string(),
	MODAL_TRANSCRIPTION_URL: z.url(),
	GROK_API_BASE_URL: z.url().optional(),
	GROK_API_KEY: z.string().optional(),
	GROK_MODEL: z.string().default("grok-4.1-thinking"),
	GROK_REASONING_EFFORT: z
		.enum(["none", "minimal", "low", "medium", "high", "xhigh"])
		.default("medium"),
	GROK_ASSET_ANALYSIS_MODEL: z.string().default("grok-4.20-beta"),
	GROK_VIDEO_ANALYSIS_MODEL: z.string().default("grok-4.20-beta"),
	GROK_ASSET_ANALYSIS_MAX_CONCURRENCY: z.coerce
		.number()
		.int()
		.min(1)
		.max(12)
		.default(4),
	GROK_ASSET_ANALYSIS_PROMPT: z.string().optional(),
	GROK_ANALYSIS_SYNTHESIS_PROMPT: z.string().optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export const webEnv = webEnvSchema.parse(process.env);
