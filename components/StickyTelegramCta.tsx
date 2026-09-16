"use client";

import { useEffect, useState } from "react";
import TelegramButton from "./TelegramButton";

export default function StickyTelegramCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 500);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`fixed right-5 z-40 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
      style={{ bottom: "calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 4.5rem)" }}
    >
      <TelegramButton className="shadow-lg" />
    </div>
  );
}
