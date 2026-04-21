import { NextResponse } from "next/server";

/**
 * Supplies the hackathon admin token to the admin UI without asking users to paste it.
 * Set `ADMIN_REVIEW_TOKEN` in frontend env (e.g. `.env.local`) — same value as backend `ADMIN_REVIEW_TOKEN`.
 * This route runs on the server only; do not use NEXT_PUBLIC_ for this secret.
 */
export async function GET() {
  const token = process.env.ADMIN_REVIEW_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      {
        error:
          "ADMIN_REVIEW_TOKEN is not configured for Next.js. Add it to frontend/.env.local (same value as backend).",
      },
      { status: 503 }
    );
  }
  return NextResponse.json({ token });
}
