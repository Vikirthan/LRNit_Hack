import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "no-reply@ticketscan.org";
const SENDER_NAME = Deno.env.get("SENDER_NAME") || "TicketScan Support";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { teamId } = await req.json();

    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY is not set in Supabase secrets");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Fetch team details & token
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("*, team_emails(email)")
      .eq("team_id", teamId)
      .single();

    if (teamError || !team) throw new Error("Team not found");
    if (!team.qr_token) throw new Error("Token not generated for this team");

    const teamEmails = team.team_emails.map((e: any) => ({ email: e.email }));
    if (!teamEmails.length) throw new Error("No emails found for this team");

    const qrUrl = `${req.headers.get("origin") || "http://localhost:5173"}/scan?token=${team.qr_token}`;

    // 2. Send via Brevo (SMTP API v3)
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: teamEmails,
        subject: `Your Team Ticket - ${team.team_name}`,
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <p style="text-align: center;"><span style="font-size: 2rem;">🎟️</span></p>
            <h2 style="color: #6366f1; text-align: center;">TicketScan Access</h2>
            <p>Hello <strong>${team.team_name}</strong>,</p>
            <p>Your unique access QR token has been generated. Use the link below to view your digital ticket. You will need to present this at the registration desk for admission.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${qrUrl}" style="background: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: bold; display: inline-block;">View My QR Ticket</a>
            </div>

            <p style="background: #f8fafc; padding: 15px; border-radius: 8px; font-size: 0.85rem; color: #475569;">
              <strong>Note:</strong> This ticket is unique to your team. Please do not share this link with others.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 0.8rem; color: #94a3b8; text-align: center;">TicketScan - Effortless Event Entry</p>
          </div>
        `,
      }),
    });

    const resData = await res.json();
    if (!res.ok) throw new Error(resData.message || "Failed to send email via Brevo");

    return new Response(JSON.stringify({ success: true, resData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Function error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
