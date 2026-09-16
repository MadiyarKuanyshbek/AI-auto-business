import type { Metadata } from "next";
import { Onest, IBM_Plex_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/siteUrl";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import "./globals.css";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "700", "800"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

const title = "Автопилот.AI — ИИ-автоматизации под ключ";
const description =
  "ИИ-администратор для автосервисов, салонов красоты и клиник: принимает заявки, записывает клиентов и напоминает о визите 24/7.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title,
    description,
    url: SITE_URL,
    locale: "ru_RU",
    type: "website",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Автопилот.AI",
  url: SITE_URL,
  description,
  areaServed: "KZ",
  sameAs: ["https://t.me/BusinessAI_auto_bot"],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${onest.variable} ${plexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {children}
        <WhatsAppFloat />
        <Analytics />
      </body>
    </html>
  );
}
