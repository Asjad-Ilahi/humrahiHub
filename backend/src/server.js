const { app } = require("./app");
const { env } = require("./config/env");

const secret = env.issueSignerSecret;
if (!secret || String(secret).length < 32) {
  console.error(
    "[backend] ISSUE_SIGNER_SECRET is missing or shorter than 32 characters. Set it in backend/.env (required to create per-issue fund wallets)."
  );
  process.exit(1);
}

app.listen(env.port, () => {
  console.log(`Backend running on http://localhost:${env.port}`);
});
