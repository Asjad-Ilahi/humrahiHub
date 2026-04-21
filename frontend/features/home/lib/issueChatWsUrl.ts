/** Build WebSocket URL for issue community chat (same host as REST API). */
export function buildIssueChatWebSocketUrl(token: string): string {
  const httpBase = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000").replace(/\/$/, "");
  const wsBase = httpBase.replace(/^http/, "ws");
  return `${wsBase}/ws/issue-chat?token=${encodeURIComponent(token)}`;
}
