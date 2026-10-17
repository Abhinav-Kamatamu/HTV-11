import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Ripple's one logo everywhere (header, favicon, tab icon): lucide-react's heart-pulse mark,
// traced here since ImageResponse can't import the React icon component directly.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c1628",
          borderRadius: "7px",
        }}
      >
        {/* satori (ImageResponse) can't parse oklch(), so these are the same navy/orange tokens
            from globals.css pre-converted to hex. Keep in sync if the palette changes. */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f2763c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
          <path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
