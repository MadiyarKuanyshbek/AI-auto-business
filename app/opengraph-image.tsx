import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          background: "#0a0a0a",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 700,
            color: "white",
            marginBottom: 24,
          }}
        >
          Автопилот<span style={{ color: "#818cf8" }}>.AI</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: "#a1a1aa",
            maxWidth: 900,
            textAlign: "center",
          }}
        >
          ИИ-администраторы, которые отвечают клиентам 24/7 и сами записывают их на услугу
        </div>
      </div>
    ),
    size,
  );
}
