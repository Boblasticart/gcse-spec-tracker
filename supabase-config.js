// Paste your own values here (see README, steps 1 and 5).
// The publishable key is designed to be public; your data is protected by the row-level security in supabase/setup.sql.
// Never put a secret key (sb_secret_...) or your Gemini key in this file.
window.TRACKER_CONFIG = {
  supabaseUrl: "PASTE_PROJECT_URL",            // rjhhtzbrnprkcajbhaez
  supabaseKey: "PASTE_PUBLISHABLE_KEY",        // sb_publishable_QDTxOMOW3KggdbWDBET6lA_so6gw2BK
  googleSignIn: false,                         // set to true once Google sign-in is set up (README step 3)
  markingUrl: "PASTE_WORKER_URL"               // e.g. "https://gcse-marking.yourname.workers.dev"
};
