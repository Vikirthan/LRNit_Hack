import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Fetch team details & token
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("*, team_emails(email)")
      .eq("team_id", teamId)
      .single();

    if (teamError || !team) throw new Error("Team not found");
    if (!team.qr_token) throw new Error("Token not generated for this team");

    const emails = team.team_emails.map((e: any) => e.email);
    if (!emails.length) throw new Error("No emails found for this team");

    const qrUrl = `${req.headers.get("origin") || "http://localhost:5173"}/scan?token=${team.qr_token}`;

    // 2. Send via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "TicketScan <onboarding@resend.dev>", 
        to: emails,
        subject: `Your Team Ticket - ${team.team_name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #6366f1;">TicketScan Access</h2>
            <p>Hello <strong>${team.team_name}</strong>,</p>
            <p>Your unique access QR token has been generated. Use the link below to view your ticket or present it at the scanning station.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${qrUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View My QR Ticket</a>
            </div>

            <p style="font-size: 0.9rem; color: #666;">If you have any issues, please contact the hackathon support team.</p>
          </div>
        `,
      }),
    });

    const resData = await res.json();
    if (!res.ok) throw new Error(resData.message || "Failed to send email");

    return new Response(JSON.stringify({ success: true, resData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Function error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200, // Return 200 to avoid generic Supabase wrapper, but logical failure
    });
  }
});
