const WebSocket = require("ws");
const { verifyIssueChatToken } = require("./issueChatTokens");
const { isFollowing, insertIssueChatMessage } = require("../services/issueService");

/** @type {Map<string, Set<import("ws")>>} */
const rooms = new Map();

function roomKey(issueId) {
  return String(issueId || "").trim();
}

function broadcast(issueId, payload) {
  const key = roomKey(issueId);
  const set = rooms.get(key);
  if (!set) return;
  const raw = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) ws.send(raw);
  }
}

function joinRoom(issueId, ws) {
  const key = roomKey(issueId);
  if (!key) return;
  let set = rooms.get(key);
  if (!set) {
    set = new Set();
    rooms.set(key, set);
  }
  set.add(ws);
  ws.__humrahiIssueRoom = key;
}

function leaveRoom(ws) {
  const key = ws.__humrahiIssueRoom;
  if (!key) return;
  const set = rooms.get(key);
  if (set) {
    set.delete(ws);
    if (set.size === 0) rooms.delete(key);
  }
  delete ws.__humrahiIssueRoom;
}

/**
 * @param {import("http").Server} server
 */
function attachIssueChatWs(server) {
  const wss = new WebSocket.Server({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    let pathname = "/";
    try {
      pathname = new URL(request.url || "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws/issue-chat") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", async (ws, request) => {
    let token = "";
    try {
      const u = new URL(request.url || "/", "http://localhost");
      token = String(u.searchParams.get("token") || "").trim();
    } catch {
      ws.close(4400, "bad url");
      return;
    }
    const claims = verifyIssueChatToken(token);
    if (!claims) {
      ws.close(4401, "unauthorized");
      return;
    }
    const issueId = claims.issueId;
    const privyUserId = claims.sub;
    try {
      const ok = await isFollowing(issueId, privyUserId);
      if (!ok) {
        ws.close(4403, "not following");
        return;
      }
    } catch {
      ws.close(1011, "server error");
      return;
    }

    joinRoom(issueId, ws);
    ws.send(JSON.stringify({ type: "ready", issueId }));

    ws.on("message", async (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!msg || msg.type !== "send" || typeof msg.text !== "string") return;
      const text = msg.text.trim().slice(0, 2000);
      if (!text) return;

      try {
        const row = await insertIssueChatMessage({ issueId, privyUserId, body: text });
        if (!row) return;
        broadcast(issueId, {
          type: "message",
          id: row.id,
          issueId,
          privyUserId: row.privy_user_id,
          senderDisplayName: row.sender_display_name,
          body: row.body,
          createdAt: row.created_at,
        });
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Could not save message." }));
      }
    });

    ws.on("close", () => leaveRoom(ws));
    ws.on("error", () => leaveRoom(ws));
  });
}

module.exports = { attachIssueChatWs, broadcast };
