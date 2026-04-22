import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "no-reply@ticketscan.org";
const SENDER_NAME = Deno.env.get("SENDER_NAME") || "TicketScan Support";

const isValidEmail = (value?: string) => {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
};

const stripHtml = (html = "") =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const mimeTypeFromName = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
};

const base64FromUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch logo from ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  const contentType = response.headers.get("content-type") || "image/svg+xml";
  return { content: btoa(binary), contentType };
};

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
    const { email, name, subject, content, signature, fromEmail, fromName, scheduledAt, eventLogoUrl, htmlContent, attachments, batchId } = await req.json();

    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY is not set in Supabase secrets");
    if (!email) throw new Error("Recipient email is required");

    // 2. Send via Brevo (SMTP API v3)
    const inlineAttachments: any[] = [];

    if (eventLogoUrl && typeof eventLogoUrl === "string" && eventLogoUrl.trim().length > 0) {
      try {
        const logo = await base64FromUrl(eventLogoUrl);
        inlineAttachments.push({
          name: "event-logo",
          content: logo.content,
          contentType: logo.contentType,
          contentId: "event-logo",
        });
      } catch (logoError) {
        console.warn("Logo embed skipped:", logoError.message);
      }
    }

    const payload: any = {
      // Always use authenticated sender identity to improve SPF/DKIM/DMARC alignment.
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email, name }],
      subject: subject || "Update from Event Team",
      htmlContent: htmlContent || `
        <html>
        <head>
          <meta name="color-scheme" content="light dark">
          <meta name="supported-color-schemes" content="light dark">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
            :root { color-scheme: light dark; supported-color-schemes: light dark; }
          </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="max-width: 550px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            
            <!-- Version: 2.0.2 (Greetings Test) -->
            <!-- Dark Modern Header (LRNit Branding) -->
            <div style="background-color: #1e293b; padding: 40px 24px; text-align: center;">
              <div style="text-align: center;">
                <!-- Optional Event Logo - LARGE AND PROMINENT -->
                 ${eventLogoUrl ? `
                 <div style="margin-bottom: 20px; text-align: center;">
                   <img src="${eventLogoUrl}" alt="Event Logo" style="height: 120px; max-width: 280px; object-fit: contain; display: inline-block;" />
                 </div>
                 ` : ''}

                <h2 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.02em;">
                  LRN<span style="color: #60a5fa;">it</span>
                </h2>
                <div style="margin-top: 12px; color: rgba(255,255,255,0.5); font-size: 12px; text-transform: uppercase; letter-spacing: 0.2em; font-weight: 700;">Learn · Build · Lead</div>
              </div>
            </div>

            <!-- Email Body Content -->
            <div style="padding: 32px 24px;">
              <h1 style="color: #111827; font-size: 20px; font-weight: 700; margin: 0 0 20px 0;">${subject}</h1>
              <p style="color: #374151; font-size: 15px; margin: 0 0 20px 0;">Greetings <strong>${name || 'Participant'}</strong>,</p>
              
              <div style="color: #4b5563; font-size: 14.5px; line-height: 1.6; margin: 0 0 32px 0; white-space: pre-wrap;">
                ${content.replace(/\n/g, '<br/>')}
              </div>

              <!-- Professional Signature Area -->
              <div style="margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 24px;">
                <div style="color: #4b5563; font-size: 14.5px; line-height: 1.6; font-style: normal; white-space: pre-wrap;">
                  ${signature ? signature.replace(/\n/g, '<br/>') : `Best Regards,<br/>${fromName || 'LRNit Team'}`}
                </div>
                ${eventLogoUrl ? `
                  <img src="${eventLogoUrl}" alt="Signature Logo" style="height: 32px; margin-top: 12px; opacity: 0.8; display: inline-block;" />
                ` : ''}
              </div>
            </div>

            <!-- Modern Footer -->
            <div style="background-color: #f8fafc; padding: 32px 24px; border-top: 1px solid #f1f5f9; text-align: center;">
              <div style="margin-bottom: 12px;">
                 <div style="width: 40px; height: 40px; margin: 0 auto 16px auto; background-color: #3b82f6; border-radius: 10px; display: table; text-align: center;">
                    <span style="display: table-cell; vertical-align: middle; color: #ffffff; font-size: 18px; font-weight: 900;">L</span>
                 </div>
                 <strong style="color: #1e293b; font-size: 14px;">LRNit Mailing Platform</strong>
                 <div style="color: #64748b; font-size: 12px; margin-top: 4px;">Join our community of builders.</div>
              </div>
              <div style="color: #94a3b8; font-size: 10px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                © 2026 LRNit. All rights reserved. <br/>
                <span style="color: #cbd5e1; font-size: 9px;">System ID: TS-SYNC-202</span>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const preferredReplyTo = isValidEmail(fromEmail) ? fromEmail!.trim() : null;
    if (preferredReplyTo) {
      payload.replyTo = { email: preferredReplyTo, name: fromName || SENDER_NAME };
    }

    payload.textContent = stripHtml(content || "") || stripHtml(payload.htmlContent || "");

    if (scheduledAt) {
      payload.scheduledAt = scheduledAt;
    }

    if (batchId && typeof batchId === "string") {
      payload.tags = [`batch:${batchId}`];
    }

    const fileAttachments = Array.isArray(attachments)
      ? attachments
          .filter((item: any) => item && typeof item.name === "string" && typeof item.content === "string")
          .map((item: any) => ({
            name: item.name,
            content: item.content,
            contentType: item.contentType || mimeTypeFromName(item.name),
          }))
      : [];

    if (inlineAttachments.length > 0 || fileAttachments.length > 0) {
      payload.attachment = [...inlineAttachments, ...fileAttachments];
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
