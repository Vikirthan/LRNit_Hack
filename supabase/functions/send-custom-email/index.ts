import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "no-reply@ticketscan.org";
const SENDER_NAME = Deno.env.get("SENDER_NAME") || "TicketScan Support";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      headers: corsHeaders,
      status: 200 
    });
  }

  try {
    const { email, name, subject, content, signature, fromEmail, fromName, scheduledAt } = await req.json();

    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY is not set in Supabase secrets");
    if (!email) throw new Error("Recipient email is required");

    // 2. Send via Brevo (SMTP API v3)
    const payload: any = {
      sender: { name: fromName || SENDER_NAME, email: fromEmail || SENDER_EMAIL },
      to: [{ email, name }],
      subject: subject || "Update from Event Team",
      htmlContent: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="font-size: 3rem;">✉️</span>
          </div>
          
          <h1 style="color: #1e293b; text-align: center; font-size: 24px; margin-bottom: 20px;">${subject}</h1>
          
          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;" />
          
          <p style="font-size: 16px; color: #334155; line-height: 1.6;">Hello <strong>${name || 'Participant'}</strong>,</p>
          
          <div style="font-size: 15px; color: #475569; line-height: 1.8; margin: 20px 0;">
            ${content.replace(/\n/g, '<br/>')}
          </div>

          ${signature ? `
          <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #f8fafc; color: #64748b;">
            <p style="margin: 0; font-size: 1rem; font-weight: 600; color: #1e293b;">Best Regards,</p>
            <p style="margin: 4px 0 0 0; font-style: italic;">${signature}</p>
          </div>
          ` : ''}
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center;">
            <p style="font-size: 0.85rem; color: #94a3b8; margin: 0;">Automated message sent via TicketScan Mailing Platform</p>
          </div>
        </div>
      `,
    };

    if (scheduledAt) {
      payload.scheduledAt = scheduledAt;
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
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
