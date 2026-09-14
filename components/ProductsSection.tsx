"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { products, type Business } from "@/lib/products";
import BusinessPetalPicker from "./BusinessPetalPicker";
import ProductDemoModal from "./ProductDemoModal";
import Reveal from "./Reveal";

export default function ProductsSection() {
  const [pickingProductId, setPickingProductId] = useState<string | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

  const pickingProduct = products.find((p) => p.id === pickingProductId) ?? null;
  const activeProduct = selectedBusiness ? pickingProduct : null;

  function reset() {
    setPickingProductId(null);
    setSelectedBusiness(null);
  }

  return (
    <section id="products" className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
          5 типов ИИ-администраторов
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
          Каждый пакет закрывает свою зону: клиентов, IT-инфраструктуру,
          сотрудников, данные или комьюнити. Выберите свой бизнес и
          протестируйте демо-диалог, чтобы понять, как это будет работать у
          вас.
        </p>
        <div className="mt-4 text-center">
          <span className="inline-block rounded-full bg-amber-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-amber-400">
            «До / После» — иллюстративный сценарий, не реальный клиент
          </span>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-6">
          {products.map((product, i) => (
            <Reveal
              key={product.id}
              delay={(i % 3) * 80}
              className="flex w-full max-w-sm sm:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]"
            >
              <div className="flex w-full flex-col rounded-2xl border border-border bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  {product.category}
                </p>
                <h3 className="mt-2 font-display text-lg font-bold">{product.title}</h3>
                <p className="mt-2 text-sm text-muted">
                  {product.description}
                </p>
                <div className="mt-4 flex-1">
                  <p className="text-xs font-medium text-muted">Где нужен:</p>
                  <ul className="mt-1 space-y-1 text-sm text-muted">
                    {product.businesses.map((business) => (
                      <li key={business.slug} className="flex gap-2">
                        <span>{business.icon}</span>
                        <span>{business.label}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-accent">
                    {product.beforeAfter.metric}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    <span className="font-medium text-foreground">До: </span>
                    {product.beforeAfter.before}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    <span className="font-medium text-emerald-400">После: </span>
                    {product.beforeAfter.after}
                  </p>
                </div>
                <button
                  onClick={() => {
                    track("demo_opened", { product: product.id });
                    setPickingProductId(product.id);
                  }}
                  className="mt-6 rounded-full bg-accent px-5 py-2 text-center text-sm font-semibold text-accent-foreground transition-all hover:scale-[1.03] hover:bg-accent/90 active:scale-[0.98]"
                >
                  Протестировать демо
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {pickingProduct && !selectedBusiness && (
        <BusinessPetalPicker
          product={pickingProduct}
          onSelect={(business) => {
            track("niche_selected", { product: pickingProduct.id, niche: business.slug });
            setSelectedBusiness(business);
          }}
          onClose={reset}
        />
      )}

      {activeProduct && selectedBusiness && (
        <ProductDemoModal
          product={activeProduct}
          business={selectedBusiness}
          onClose={reset}
        />
      )}
    </section>
  );
}
