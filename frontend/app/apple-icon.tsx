import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #afff6f 0%, #8fd94a 100%)",
          borderRadius: 36,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <span style={{ fontSize: 72, fontWeight: 800, color: "#131313", letterSpacing: -2 }}>H</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: "#131313", marginTop: 4, opacity: 0.85 }}>HumRahi</span>
      </div>
    ),
    { ...size },
  );
}
