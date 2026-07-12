import { ImageResponse } from "next/og";

// Icona Home iOS (PNG 180x180). Brand "Gym Solo Leveling": tutto viola
// con la scritta LEVELING. iOS ignora le icone SVG, quindi serve questo
// PNG generato altrimenti mette uno screenshot generico della pagina.
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
          background: "linear-gradient(150deg, #8b5cf6 0%, #6d28d9 55%, #4c1d95 100%)",
          color: "#ffffff"
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 4,
            color: "#e9d5ff"
          }}
        >
          GYM SOLO
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: 1,
            marginTop: 4
          }}
        >
          LEVELING
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 10,
            padding: "3px 12px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.16)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#f5f3ff"
          }}
        >
          LV 100
        </div>
      </div>
    ),
    { ...size }
  );
}
