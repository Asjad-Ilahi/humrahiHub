const http = require("http");
const { app } = require("./app");
const { env } = require("./config/env");
const { attachIssueChatWs } = require("./realtime/issueChatWs");
const { syncAllActiveIssues } = require("./services/issueLifecycleSync");

const secret = env.issueSignerSecret;
if (!secret || String(secret).length < 32) {
  console.error(
    "[backend] ISSUE_SIGNER_SECRET is missing or shorter than 32 characters. Set it in backend/.env (required to create per-issue fund wallets)."
  );
  process.exit(1);
}

const server = http.createServer(app);
attachIssueChatWs(server);
server.listen(env.port, () => {
  console.log(`Backend running on http://localhost:${env.port} (WebSocket issue chat on /ws/issue-chat)`);
});

const LIFECYCLE_SYNC_MS = 15_000;
setInterval(() => {
  void syncAllActiveIssues();
}, LIFECYCLE_SYNC_MS);
void syncAllActiveIssues();
