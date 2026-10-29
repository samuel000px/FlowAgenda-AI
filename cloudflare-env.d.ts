declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    APP_SENHA?: string;
    CALENDAR_ENCRYPTION_KEY?: string;
  }
}
