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
    const { email, name, subject, content, signature, fromEmail, fromName, scheduledAt, eventLogoUrl } = await req.json();

    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY is not set in Supabase secrets");
    if (!email) throw new Error("Recipient email is required");

    // 2. Send via Brevo (SMTP API v3)
    const payload: any = {
      sender: { name: fromName || SENDER_NAME, email: fromEmail || SENDER_EMAIL },
      to: [{ email, name }],
      subject: subject || "Update from Event Team",
      htmlContent: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
          </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="max-width: 550px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            
            <!-- Dark Modern Header (Unstop Inspired) -->
            <div style="background-color: #1e293b; padding: 48px 24px; text-align: center;">
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
                
                <!-- Icon Branding -->
                <div style="margin-bottom: 24px;">
                   <div style="width: 56px; height: 56px; margin: 0 auto 16px auto; background-color: #3b82f6; border-radius: 14px; display: table; text-align: center;">
                      <span style="display: table-cell; vertical-align: middle; color: #ffffff; font-size: 24px; font-weight: 900; font-family: 'Inter', sans-serif;">L</span>
                   </div>
                   <h2 style="color: #ffffff; margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -0.04em;">
                     LRN<span style="color: #60a5fa;">it</span>
                   </h2>
                   <div style="margin-top: 8px; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.35em; font-weight: 800;">Learn · Build · Lead</div>
                </div>

                <!-- Optional Event Logo Below -->
                ${eventLogoUrl ? `
                <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.1); width: 80%; margin-left: auto; margin-right: auto;">
                   <img src="${eventLogoUrl}" alt="Event Logo" style="height: 54px; max-width: 220px; object-fit: contain;" />
                </div>
                ` : ''}
              </div>
            </div>

            <!-- Email Body Content -->
            <div style="padding: 40px 32px; background-color: #ffffff;">
              <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 0 0 24px 0; line-height: 1.3;">${subject}</h1>
              <p style="color: #334155; font-size: 16px; margin: 0 0 20px 0; font-weight: 600;">Hi ${name || 'Participant'},</p>
              
              <div style="color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 32px 0; white-space: pre-wrap;">
                ${content.replace(/\n/g, '<br/>')}
              </div>

              <!-- Professional Signature Area -->
              ${signature ? `
              <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #f1f5f9;">
                <div style="color: #334155; font-size: 15px; line-height: 1.6; font-style: normal;">
                  ${signature.replace(/\n/g, '<br/>')}
                </div>
                <!-- Mini Logo Branding in Signature -->
                <div style="margin-top: 16px;">
                  <strong style="color: #1e293b; font-size: 14px; font-weight: 700;">LRNit Team</strong>
                </div>
              </div>
              ` : ''}
            </div>

            <!-- Modern Footer -->
            <div style="background-color: #f8fafc; padding: 32px 24px; border-top: 1px solid #f1f5f9; text-align: center;">
              <div style="margin-bottom: 20px;">
                 <strong style="color: #1e293b; font-size: 15px;">LRNit Mailing Platform</strong>
                 <div style="color: #64748b; font-size: 12px; margin-top: 6px;">Join our community of builders and innovators.</div>
              </div>
              <div style="padding-top: 20px; border-top: 1px solid #eef2f6; color: #94a3b8; font-size: 11px;">
                © 2026 LRNit. All rights reserved. Professional Event Infrastructure.
              </div>
            </div>
          </div>
        </body>
        </html>
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
