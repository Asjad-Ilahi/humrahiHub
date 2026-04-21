import type { MetadataRoute } from "next";

function isHttpUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (isHttpUrl(explicit)) return explicit as string;

  const v = process.env.VERCEL_URL?.trim();
  const vercelUrl = v ? `https://${v.replace(/^https?:\/\//, "")}` : undefined;
  if (isHttpUrl(vercelUrl)) return vercelUrl as string;

  return "http://localhost:3000";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();
  const now = new Date();
  const staticPaths = ["", "/auth", "/login", "/faqs", "/home", "/home/report"];
  return staticPaths.map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
