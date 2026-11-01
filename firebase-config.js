// Paste your own values here (see README, steps 1 and 3).
// These Firebase web settings are designed to be public; your data is protected by firestore.rules.
window.TRACKER_CONFIG = {
  firebase: {
    apiKey: "PASTE_API_KEY",
    authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
    projectId: "PASTE_PROJECT_ID",
    appId: "PASTE_APP_ID"
  },
  // Your Cloudflare Worker address, e.g. "https://gcse-marking.yourname.workers.dev"
  markingUrl: "PASTE_WORKER_URL"
};
