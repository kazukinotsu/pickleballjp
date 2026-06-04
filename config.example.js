/*
 * Copy this file to `config.js` and fill in the two values below.
 * Get them from: Supabase Dashboard > your project > Settings > API
 *   - SUPABASE_URL      = "Project URL"   (e.g. https://xxxxx.supabase.co)
 *   - SUPABASE_ANON_KEY = "anon public"   (long JWT string)
 *
 * The anon key is SAFE to commit / ship to the browser — it is restricted
 * by Row Level Security policies defined in supabase-schema.sql.
 * NEVER use the `service_role` key here; that one must stay private.
 */
window.SUPABASE_URL      = "YOUR_SUPABASE_URL";
window.SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

/*
 * Google Maps Platform API key (Places API + Geocoding API).
 * Used for venue / location autocomplete. Safe to ship to the browser, but you
 * MUST restrict it in Google Cloud Console:
 *   - Application restrictions: HTTP referrers
 *       https://picklejp.gepartners.ai/*  and  http://localhost:3000/*
 *   - API restrictions: Places API, Geocoding API only
 * Leave as the placeholder to fall back to OpenStreetMap (Nominatim).
 */
window.GOOGLE_MAPS_API_KEY = "YOUR_GOOGLE_MAPS_API_KEY";
