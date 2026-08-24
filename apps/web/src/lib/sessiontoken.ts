let accessToken: string | null = null;

export const sessionExpiredEvent = "cash-flow:session-expired";
export const sessionRestoredEvent = "cash-flow:session-restored";

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}
