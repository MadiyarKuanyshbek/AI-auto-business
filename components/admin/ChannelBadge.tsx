export default function ChannelBadge({ channel }: { channel: "whatsapp" | "telegram" }) {
  return channel === "telegram" ? (
    <span className="rounded-full bg-[#26A5E4]/15 px-2 py-0.5 text-xs font-medium text-[#26A5E4]">Telegram</span>
  ) : (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
      WhatsApp
    </span>
  );
}
