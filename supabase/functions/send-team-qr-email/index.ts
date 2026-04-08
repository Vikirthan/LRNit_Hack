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
    const { teamId, baseUrl } = await req.json();

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

    // Use baseUrl if provided, fallback to requested origin, or default localhost:5173
    const actualBaseUrl = baseUrl || req.headers.get("origin") || "http://localhost:5173";
    const qrUrl = `${actualBaseUrl}/scan?token=${team.qr_token}`;

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
        subject: `🎟️ Important: Your Aethera X Hackathon Ticket - ${team.team_name}`,
        htmlContent: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <span style="font-size: 3rem;">🚀</span>
            </div>
            
            <h1 style="color: #1e293b; text-align: center; font-size: 24px; margin-bottom: 10px;">Aethera X - 24 Hours Hackathon</h1>
            <p style="text-align: center; color: #64748b; font-size: 16px;">Thanks for registering with us!</p>
            
            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;" />
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">Hello <strong>${team.team_name}</strong>,</p>
            
            <p style="font-size: 15px; color: #475569; line-height: 1.6;">
              Your unique access QR token is ready! This QR code is <strong>mandatory</strong> for:
            </p>
            
            <ul style="color: #475569; font-size: 15px; line-height: 1.8;">
              <li>Punching your presence (Attendance)</li>
              <li>In/Out entries at the venue</li>
              <li>Registration for all Judging Rounds</li>
            </ul>

            <div style="text-align: center; margin: 35px 0;">
              <a href="${qrUrl}" style="background: #4f46e5; color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; display: inline-block; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">View My QR Ticket</a>
            </div>

            <p style="background: #eef2ff; padding: 15px; border-radius: 12px; font-size: 0.9rem; color: #3730a3; border-left: 4px solid #4f46e5;">
              <strong>Team Verification:</strong> Your team is registered with <strong>${team.members_count || 0} members</strong>. 
              Please ensure all members are present during scanning for attendance and judging.
            </p>

            <p style="font-size: 15px; color: #475569; margin-top: 25px;">
              ⚠️ <strong>Important:</strong> Please keep this QR safe. We recommend you <strong>"Star" this email</strong> right now so you can find it instantly at the venue.
            </p>
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="font-size: 0.85rem; color: #94a3b8; margin: 0;">Organized with ❤️ for Aethera X</p>
            </div>
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
