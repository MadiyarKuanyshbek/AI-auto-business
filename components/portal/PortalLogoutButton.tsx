"use client";

import { useRouter } from "next/navigation";

export default function PortalLogoutButton() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await fetch("/api/portal/logout", { method: "POST" });
        router.push("/portal/login");
        router.refresh();
      }}
      className="text-sm text-muted transition-colors hover:text-foreground"
    >
      Выйти
    </button>
  );
}
