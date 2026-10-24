import { ImageResponse } from "next/og";

// The card a link to the site shows when it's shared. Words only: a number
// here would have no error bar and would go stale with the next run.
export const alt = "VerifAI: evaluating a customer-support agent, with every number carrying its error bar.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "#ffffff", color: "#1f1f1f" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#1f1f1f" />
            <path d="M9 16.5l4.5 4.5L23 11" fill="none" stroke="#3fae6a" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 600 }}>VerifAI</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 44, lineHeight: 1.25, maxWidth: 960 }}>
            A customer-support agent, run on fixed tasks many times and checked by code, with every number carrying its error bar.
          </div>
          <div style={{ fontSize: 26, color: "#6b6b6b" }}>A read-only snapshot of committed results. Runs happen locally.</div>
        </div>
      </div>
    ),
    size,
  );
}
