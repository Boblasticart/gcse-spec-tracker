/** Codes from the auth API that the forms treat specially. */
export const OTP_DEAD_CODES = new Set(["CODE_EXPIRED", "TOO_MANY_ATTEMPTS"]);

export const EMAIL_KEY = "gst-pending-email";

export function rememberEmail(email: string): void {
  try {
    sessionStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    // Private mode: the verify page just won't show the address.
  }
}

export function recallEmail(): string | null {
  try {
    return sessionStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}
