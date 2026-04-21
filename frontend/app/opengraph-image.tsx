import { ImageResponse } from "next/og";

export const alt = "HumRahi Hub — civic issues, transparent funding, community action";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 72,
          background: "linear-gradient(125deg, #0a0a0a 0%, #1a1f14 42%, #131313 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 36,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#afff6f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 800,
              color: "#131313",
            }}
          >
            H
          </div>
          <span style={{ fontSize: 42, fontWeight: 700, color: "#f5f5f5", letterSpacing: -1 }}>HumRahi Hub</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "baseline",
            gap: 12,
            fontSize: 64,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.08,
            maxWidth: 900,
          }}
        >
          <div style={{ display: "flex" }}>See a problem.</div>
          <div style={{ display: "flex", color: "#afff6f" }}>Share it.</div>
          <div style={{ display: "flex" }}>Solve it together.</div>
        </div>
        <div style={{ marginTop: 28, fontSize: 26, color: "#a3a3a3", maxWidth: 820, lineHeight: 1.4 }}>
          A social impact platform that connects people who report local issues with funders and volunteers—transparently.
        </div>
      </div>
    ),
    { ...size },
  );
}
