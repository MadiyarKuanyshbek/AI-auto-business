import { cookies } from "next/headers";
import { sql, type SubscriptionRow } from "@/lib/db";
import { verifyPortalSessionToken } from "@/lib/portalAuth";

/** Подписка вошедшего в личный кабинет клиента или null, если не авторизован. */
export async function getPortalSubscription(): Promise<SubscriptionRow | null> {
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret || !sql) return null;
  const token = (await cookies()).get("portal_session")?.value;
  const subscriptionId = await verifyPortalSessionToken(token, secret);
  if (!subscriptionId) return null;
  const [sub] = (await sql`SELECT * FROM subscriptions WHERE id = ${subscriptionId}`) as SubscriptionRow[];
  return sub ?? null;
}
