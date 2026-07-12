import { ImageResponse } from "next/og";

// iOS Safari "Aggiungi a Home" ignora le icone SVG e, senza un
// apple-touch-icon PNG, usa uno screenshot generico della pagina. Questo
// genera un vero PNG 180x180 con il dumbbell del brand così l'icona
// salvata sull'iPad torna a essere quella corretta.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#11141a",
          display: "flex",
          position: "relative"
        }}
      >
        {/* accento verticale tenue (teal) dietro il manubrio */}
        <div
          style={{
            position: "absolute",
            left: 76,
            top: 42,
            width: 28,
            height: 96,
            borderRadius: 14,
            background: "#2eb3a3",
            opacity: 0.3
          }}
        />
        {/* piatto sinistro */}
        <div
          style={{
            position: "absolute",
            left: 34,
            top: 79,
            width: 31,
            height: 22,
            borderRadius: 7,
            background: "#f59d18"
          }}
        />
        {/* barra centrale */}
        <div
          style={{
            position: "absolute",
            left: 62,
            top: 70,
            width: 56,
            height: 40,
            borderRadius: 14,
            background: "#f59d18"
          }}
        />
        {/* piatto destro */}
        <div
          style={{
            position: "absolute",
            left: 115,
            top: 79,
            width: 31,
            height: 22,
            borderRadius: 7,
            background: "#f59d18"
          }}
        />
      </div>
    ),
    { ...size }
  );
}
