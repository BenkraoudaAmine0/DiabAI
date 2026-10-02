/** sessionStorage keys shared by the login page and /auth/set-password. */

// set before "Forgot password?" sends the email: the reset link (PKCE) only
// carries ?code=, so this tells the set-password page it's a reset
export const RECOVERY_FLAG = "diabai-recovery";

// email to prefill on the login page after a password was set (kept out of
// the URL so it doesn't end up in browser history or server logs)
export const LOGIN_EMAIL = "diabai-login-email";

export function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null; // storage blocked
  }
}

export function writeSession(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked: only a convenience is lost */
  }
}
