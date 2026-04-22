import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const BREVO_WEBHOOK_SECRET = Deno.env.get("BREVO_WEBHOOK_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonObject = Record<string, unknown>;

function parseEventTime(input: unknown): string {
  if (typeof input === "number" && Number.isFinite(input)) {
    const milliseconds = input < 1e12 ? input * 1000 : input;
    const parsed = new Date(milliseconds);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  if (typeof input === "string" && input.trim().length > 0) {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  return new Date().toISOString();
}

async function sha256Hex(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buffer))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

async function normalizeEvent(raw: JsonObject) {
  const eventType = String(raw.event ?? raw.type ?? raw.event_type ?? "unknown").toLowerCase();
  const recipientEmail = raw.email ? String(raw.email) : null;
  const subject = raw.subject ? String(raw.subject) : null;
  const providerMessageId = raw["message-id"]
    ? String(raw["message-id"])
    : raw.message_id
    ? String(raw.message_id)
    : raw.id
    ? String(raw.id)
    : null;
  const eventId = raw["event-id"]
    ? String(raw["event-id"])
    : raw.event_id
    ? String(raw.event_id)
    : raw.uuid
    ? String(raw.uuid)
    : null;
  const tag = raw.tag ? String(raw.tag) : null;
  const eventTime = parseEventTime(raw.ts_event ?? raw.ts ?? raw.date ?? raw.created_at);

  const eventKeySeed = JSON.stringify({
    provider: "brevo",
    eventType,
    recipientEmail,
    providerMessageId,
    eventTime,
    eventId,
    raw,
  });

  return {
    event_key: await sha256Hex(eventKeySeed),
    provider: "brevo",
    event_type: eventType,
    event_id: eventId,
    provider_message_id: providerMessageId,
    recipient_email: recipientEmail,
    subject,
    tag,
    event_time: eventTime,
    payload: raw,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase env vars are not configured for brevo-webhook function");
    }

    if (!BREVO_WEBHOOK_SECRET) {
      throw new Error("BREVO_WEBHOOK_SECRET is not configured");
    }

    const tokenFromQuery = new URL(req.url).searchParams.get("token");
    const tokenFromHeader = req.headers.get("x-webhook-token");
    const providedToken = tokenFromHeader || tokenFromQuery;

    if (!providedToken || providedToken !== BREVO_WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized webhook request" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const rawPayload = await req.json();
    const events: JsonObject[] = Array.isArray(rawPayload) ? rawPayload : [rawPayload];

    if (events.length === 0) {
      return new Response(JSON.stringify({ success: true, inserted: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const rows = [];
    for (const item of events) {
      if (!item || typeof item !== "object") continue;
      rows.push(await normalizeEvent(item));
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from("email_events").upsert(rows, {
      onConflict: "event_key",
      ignoreDuplicates: true,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        inserted: rows.length,
        skipped: Math.max(events.length - rows.length, 0),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message || "Unknown webhook error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
