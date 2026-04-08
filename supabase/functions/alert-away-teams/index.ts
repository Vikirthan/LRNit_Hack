import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "no-reply@ticketscan.org";
const SENDER_NAME = Deno.env.get("SENDER_NAME") || "Aethera X Support";

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

    // Fetch team details
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("*, team_emails(email)")
      .eq("team_id", teamId)
      .single();

    if (teamError || !team) throw new Error("Team not found");

    const teamEmails = team.team_emails.map((e: any) => ({ email: e.email }));
    if (!teamEmails.length) throw new Error("No emails found for this team");

    // Use baseUrl if provided
    const actualBaseUrl = baseUrl || req.headers.get("origin") || "http://localhost:5173";
    const ticketUrl = `${actualBaseUrl}/scan?token=${team.qr_token || 'missing'}`;

    // Send Alert via Brevo
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: teamEmails,
        subject: `🚨 URGENT: Please Report to Hackathon Arena - Team ${team.team_name}`,
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 32px; border: 2px solid #f59e0b; border-radius: 20px; background-color: #fffbeb;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 3rem;">📢</span>
            </div>
            
            <h1 style="color: #92400e; text-align: center; font-size: 26px; margin-bottom: 8px;">Report to Arena Immediately</h1>
            <p style="text-align: center; color: #b45309; font-size: 16px;">Action Required: Aethera X Attendance Alert</p>
            
            <hr style="border: none; border-top: 1px solid #fde68a; margin: 24px 0;" />
            
            <p style="font-size: 16px; color: #451a03; line-height: 1.6;">Hello <strong>${team.team_name}</strong>,</p>
            
            <p style="font-size: 15px; color: #78350f; line-height: 1.6;">
              Our records show that your team is currently not present in the hackathon arena. 
              Important sessions or judging rounds may be starting soon.
            </p>
            
            <div style="background: #ffffff; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid #fde68a;">
              <p style="margin: 0; color: #92400e; font-weight: 700; font-size: 1.1rem;">Instructions:</p>
              <ul style="color: #78350f; font-size: 15px; line-height: 1.8; margin-top: 10px;">
                <li>Return to your designated room: <strong>${team.room_number || 'TBA'}</strong></li>
                <li>Ensure all <strong>${team.members_count || 0} members</strong> are present.</li>
                <li>Have your QR ticket ready for verification.</li>
              </ul>
            </div>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${ticketUrl}" style="background: #d97706; color: white; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 1rem;">View Your QR Ticket</a>
            </div>

            <p style="font-size: 0.85rem; color: #b45309; text-align: center; margin-top: 24px;">
              If you are already in the arena, please report to the help session desk to verify your attendance status.
            </p>
          </div>
        `,
      }),
    });

    const resData = await res.json();
    return new Response(JSON.stringify({ success: res.ok, resData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
