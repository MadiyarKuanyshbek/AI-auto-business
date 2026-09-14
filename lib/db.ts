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
  created_at: string;
};
