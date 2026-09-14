import { NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/adminAuth";
import { sql, type LeadStatus } from "@/lib/db";

const VALID_STATUSES: LeadStatus[] = ["new", "contacted", "won", "lost"];

async function isAuthorized(request: Request) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return false;
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return verifyAdminSessionToken(match?.[1], secret);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!sql) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const status =
    typeof body === "object" && body !== null && "status" in body
      ? String((body as { status: unknown }).status)
      : "";

  if (!VALID_STATUSES.includes(status as LeadStatus)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  await sql`UPDATE leads SET status = ${status} WHERE id = ${leadId}`;

  return NextResponse.json({ ok: true });
}
