"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { buildIssueChatWebSocketUrl } from "../lib/issueChatWsUrl";

const LIME = "#B3FF66";
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

export type ChatMessageRow = {
  id: string;
  privy_user_id: string;
  sender_display_name: string;
  body: string;
  created_at: string;
};

type WsPayload =
  | { type: "ready"; issueId: string }
  | { type: "message"; id: string; senderDisplayName: string; body: string; createdAt: string; privyUserId?: string }
  | { type: "error"; message: string };

type Props = {
  issueId: string;
  open: boolean;
  onClose: () => void;
  /** Must be following (donating auto-follows) to use chat. */
  canChat: boolean;
  privyUserId: string;
};

export default function IssueCommunityChat({ issueId, open, onClose, canChat, privyUserId }: Props) {
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const scrollBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    scrollBottom();
  }, [open, messages.length, scrollBottom]);

  useEffect(() => {
    if (!open || !canChat || !privyUserId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setBanner(null);
      try {
        const hist = await fetch(
          `${backendUrl}/api/issues/${encodeURIComponent(issueId)}/chat/messages`,
          { headers: { "x-privy-user-id": privyUserId } }
        );
        const hj = (await hist.json()) as { data?: ChatMessageRow[]; error?: string };
        if (!hist.ok) {
          if (!cancelled) setBanner(hj.error ?? "Could not load messages.");
          if (!cancelled) setMessages([]);
          return;
        }
        if (!cancelled) setMessages(hj.data ?? []);

        const tokRes = await fetch(`${backendUrl}/api/issues/${encodeURIComponent(issueId)}/chat/token`, {
          method: "POST",
          headers: { "x-privy-user-id": privyUserId },
        });
        const tj = (await tokRes.json()) as { data?: { token?: string }; error?: string };
        if (!tokRes.ok) {
          if (!cancelled) setBanner(tj.error ?? "Could not open chat session.");
          return;
        }
        const token = tj.data?.token;
        if (!token) {
          if (!cancelled) setBanner("Chat session unavailable.");
          return;
        }

        const ws = new WebSocket(buildIssueChatWebSocketUrl(token));
        wsRef.current = ws;

        ws.onmessage = (ev) => {
          let p: WsPayload;
          try {
            p = JSON.parse(String(ev.data)) as WsPayload;
          } catch {
            return;
          }
          if (p.type === "message") {
            setMessages((prev) => [
              ...prev,
              {
                id: p.id,
                privy_user_id: p.privyUserId ?? "",
                sender_display_name: p.senderDisplayName,
                body: p.body,
                created_at: p.createdAt,
              },
            ]);
          } else if (p.type === "error") {
            setBanner(p.message);
          }
        };
        ws.onerror = () => {
          if (!cancelled) setBanner("WebSocket connection error.");
        };
      } catch {
        if (!cancelled) setBanner("Could not reach chat.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [open, canChat, issueId, privyUserId]);

  const send = () => {
    const t = input.trim();
    if (!t || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setSending(true);
    try {
      wsRef.current.send(JSON.stringify({ type: "send", text: t }));
      setInput("");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[1.5px] transition-opacity duration-300 ease-out"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Community chat"
        className="flex max-h-[min(88vh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-[20px] border border-stroke bg-white shadow-2xl transition-all duration-300 ease-out animate-fade-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stroke px-5 py-4">
          <div className="flex items-center gap-2">
            <span
              className="flex size-10 items-center justify-center rounded-full border border-stroke bg-card"
              style={{ color: LIME }}
            >
              <MessageCircle className="size-5 text-secondary" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-bold text-secondary">Community chat</h2>
              <p className="text-xs text-text-secondary">Discuss this issue with other followers.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-text-secondary transition-colors hover:bg-card hover:text-secondary"
            aria-label="Close chat"
          >
            <X className="size-5" />
          </button>
        </div>

        {!canChat ? (
          <div className="px-6 py-16 text-center text-sm text-text-secondary">
            Follow this issue to join the conversation. Donating automatically follows the project.
          </div>
        ) : (
          <>
            <div
              ref={listRef}
              className="min-h-[320px] flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4"
            >
              {loading ? (
                <div className="flex justify-center py-12 text-text-secondary">
                  <Loader2 className="size-8 animate-spin" aria-hidden />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-text-secondary">No messages yet — say hello.</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className="animate-fade-slide-in rounded-2xl border border-stroke bg-card/60 px-4 py-3 transition-all duration-200"
                  >
                    <p className="text-xs font-semibold text-secondary">{m.sender_display_name}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{m.body}</p>
                    <p className="mt-2 text-[11px] text-text-secondary">
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
            {banner ? <p className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-950">{banner}</p> : null}
            <div className="border-t border-stroke bg-card/40 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Write a message…"
                  className="min-w-0 flex-1 rounded-full border border-stroke bg-white px-4 py-3 text-sm text-secondary outline-none transition-shadow focus:ring-2 focus:ring-primary/40"
                  maxLength={2000}
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !input.trim()}
                  className="inline-flex size-12 shrink-0 items-center justify-center rounded-full font-semibold text-secondary transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                  style={{ backgroundColor: LIME }}
                  aria-label="Send"
                >
                  {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
