export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL - redirect to Landing Page for local login
export const getLoginUrl = () => {
  // Use local login page instead of OAuth
  return "/";
};

// Legacy OAuth login (kept for reference, not used)
export const getOAuthLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
