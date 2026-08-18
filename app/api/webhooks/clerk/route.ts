import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { getPool } from "@/lib/db";

type EmailAddress = {
  id: string;
  email_address: string;
};

type ClerkUserEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: EmailAddress[];
    primary_email_address_id?: string;
    first_name?: string | null;
    last_name?: string | null;
  };
};

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CLERK_WEBHOOK_SECRET is not set" },
      { status: 500 }
    );
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ClerkUserEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, headers) as unknown as ClerkUserEvent;
  } catch {
    return NextResponse.json({ error: "invalid webhook signature" }, { status: 400 });
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const { id, email_addresses = [], primary_email_address_id, first_name, last_name } = event.data;
    const primary =
      email_addresses.find((e) => e.id === primary_email_address_id) ??
      email_addresses[0];
    const email = primary?.email_address ?? "";

    if (!id || !email) {
      return NextResponse.json({ error: "missing user id or email" }, { status: 400 });
    }

    await getPool().query(
      `INSERT INTO users (id, email, first_name, last_name, subscription_status)
       VALUES ($1, $2, $3, $4, 'none')
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         updated_at = now()`,
      [id, email, first_name ?? null, last_name ?? null]
    );
  }

  return NextResponse.json({ ok: true });
}