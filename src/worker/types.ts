export type Env = {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  APP_URL: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  ALLOW_DEV_MAGIC_REVEAL?: string;
};

export type AppVariables = {
  user?: { id: string; email: string; name: string | null };
};
