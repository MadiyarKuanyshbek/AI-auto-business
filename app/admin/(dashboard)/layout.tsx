import AdminSidebar from "@/components/admin/AdminSidebar";

// Route group (dashboard) — не добавляет сегмент в URL (/admin, /admin/accepted и т.д.
// остаются как есть), но исключает app/admin/login из этого layout: логин-странице
// сайдбар не нужен, а middleware.ts и так пускает её без проверки.
export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-black">
      <AdminSidebar />
      <main className="flex-1 overflow-x-auto px-6 py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
