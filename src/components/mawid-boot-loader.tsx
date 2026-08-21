import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

const EXIT_DURATION_MS = 320;

export function MawidBootLoader() {
  const [leaving, setLeaving] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setLeaving(true));
    const timeout = window.setTimeout(() => setVisible(false), EXIT_DURATION_MS);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes mawid-loader-turn { to { transform: rotate(360deg); } }
        [data-mawid-boot-loader="true"] .mawid-loader-icon {
          animation: mawid-loader-turn 1s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-mawid-boot-loader="true"],
          [data-mawid-boot-loader="true"] .mawid-loader-icon {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
      <div
        data-mawid-boot-loader="true"
        role="status"
        aria-label="MAWID is loading · جارٍ تحميل موعد"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#F7F1E8",
          color: "#242521",
          opacity: leaving ? 0 : 1,
          pointerEvents: leaving ? "none" : "auto",
          transition: `opacity ${EXIT_DURATION_MS}ms ease`,
        }}
      >
        <div style={{ display: "grid", justifyItems: "center", textAlign: "center" }}>
          <LoaderCircle
            className="mawid-loader-icon"
            aria-hidden="true"
            size={34}
            strokeWidth={1.75}
            style={{ color: "#B18A4A" }}
          />
          <p
            style={{
              margin: "18px 0 0",
              color: "#0B4D3B",
              fontFamily: "Inter, Tajawal, sans-serif",
              fontSize: "22px",
              fontWeight: 750,
              letterSpacing: "-0.02em",
            }}
          >
            MAWID <span style={{ color: "#B18A4A", fontWeight: 500 }}>|</span>{" "}
            <span dir="rtl" style={{ fontFamily: "Tajawal, Inter, sans-serif" }}>
              موعد
            </span>
          </p>
          <p
            style={{
              margin: "8px 0 0",
              color: "#5f625b",
              fontFamily: "Inter, Tajawal, sans-serif",
              fontSize: "13px",
            }}
          >
            Smarter schedules. Stronger salons.
          </p>
          <p
            dir="rtl"
            style={{
              margin: "4px 0 0",
              color: "#77786f",
              fontFamily: "Tajawal, Inter, sans-serif",
              fontSize: "12px",
            }}
          >
            مواعيد أذكى. إدارة أفضل.
          </p>
        </div>
      </div>
    </>
  );
}
