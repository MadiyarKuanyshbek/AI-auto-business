"use client";

import { useEffect, useState } from "react";
import type { Business, Product } from "@/lib/products";

export default function BusinessPetalPicker({
  product,
  onSelect,
  onClose,
}: {
  product: Product;
  onSelect: (business: Business) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), 20);
    const updateWidth = () => setViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateWidth);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const count = product.businesses.length;
  const petalWidth = viewportWidth && viewportWidth < 420 ? 80 : 96;
  const baseRadius = count > 4 ? 150 : 130;
  const maxRadius = viewportWidth
    ? Math.max(80, viewportWidth / 2 - petalWidth / 2 - 16)
    : baseRadius;
  const radius = Math.min(baseRadius, maxRadius);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div className="relative flex h-[360px] w-[360px] items-center justify-center">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          aria-label="Закрыть"
          className="absolute right-0 top-0 rounded-full bg-surface p-2 text-muted shadow-lg transition-colors hover:bg-white/10"
        >
          ✕
        </button>
        <div className="absolute flex h-24 w-24 flex-col items-center justify-center rounded-full bg-accent p-2 text-center text-xs font-semibold text-accent-foreground shadow-lg">
          Выберите ваш бизнес
        </div>

        {product.businesses.map((business, index) => {
          const angle = (360 / count) * index - 90;
          const radians = (angle * Math.PI) / 180;
          const x = Math.cos(radians) * radius;
          const y = Math.sin(radians) * radius;

          return (
            <button
              key={business.slug}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(business);
              }}
              style={{
                width: `${petalWidth}px`,
                transform: open
                  ? `translate(${x}px, ${y}px) scale(1)`
                  : "translate(0px, 0px) scale(0.2)",
                opacity: open ? 1 : 0,
                transitionDelay: `${index * 60}ms`,
              }}
              className="absolute flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface p-3 text-center shadow-lg transition-all duration-300 ease-out hover:scale-105 hover:border-accent/50"
            >
              <span className="text-2xl">{business.icon}</span>
              <span className="text-[11px] font-medium leading-tight text-foreground">
                {business.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
