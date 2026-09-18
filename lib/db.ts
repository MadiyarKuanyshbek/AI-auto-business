import { neon } from "@neondatabase/serverless";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

export const sql = getSql();

export type LeadStatus = "new" | "contacted" | "won" | "lost";

export type LeadRow = {
  id: number;
  name: string;
  contact: string;
  niche: string;
  comment: string;
  source: string;
  status: LeadStatus;
  reminded_at: string | null;
  created_at: string;
};

export type GroupLeadRow = {
  id: number;
  chat_id: number;
  chat_title: string | null;
  message_id: number;
  niche: string | null;
  business_label: string | null;
  message_text: string | null;
  sender_username: string | null;
  sender_name: string | null;
  pitch: string;
  created_at: string;
};

export type TelegramSessionRow = {
  chat_id: number;
  niche: string | null;
  niche_label: string | null;
  lead_saved: boolean;
  updated_at: string;
};

export type BusinessRow = {
  id: number;
  name: string;
  industry: string;
  city: string;
  address: string;
  card_url: string;
  whatsapp: string;
  score: number;
  qualified: boolean;
  pitch: string;
  viewed: boolean;
  created_at: string;
};

export type SubscriptionStatus = "pending_payment" | "active" | "expired" | "cancelled";
export type SubscriptionChannel = "whatsapp" | "telegram";

export type SubscriptionRow = {
  id: number;
  owner_id: string;
  product_id: string;
  business_slug: string | null;
  business_name: string;
  contact_name: string;
  contact_phone: string;
  contact_telegram: string | null;
  price_kzt: number;
  status: SubscriptionStatus;
  current_period_end: string | null;
  pairing_code: string | null;
  reminded_3d_at: string | null;
  reminded_1d_at: string | null;
  otp_code: string | null;
  otp_expires_at: string | null;
  system_prompt: string | null;
  channel: SubscriptionChannel;
  telegram_bot_token: string | null;
  telegram_bot_username: string | null;
  telegram_webhook_secret: string | null;
  telegram_owner_chat_id: number | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionPaymentStatus = "claimed" | "confirmed" | "rejected";

export type SubscriptionPaymentRow = {
  id: number;
  subscription_id: number;
  status: SubscriptionPaymentStatus;
  claimed_at: string;
  confirmed_at: string | null;
};
