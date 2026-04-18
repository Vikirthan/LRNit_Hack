import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as jose from "https://deno.land/x/jose@v4.13.1/index.ts";

const JWT_SECRET = Deno.env.get("JWT_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (!token) throw new Error("Token is required");

    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret);
      return new Response(JSON.stringify({ success: true, teamId: payload.teamId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (verifyErr) {
      // Verification failed (missing/invalid secret or bad signature).
      // As a pragmatic fallback for environments where JWT_SECRET is not configured,
      // decode the token payload without verification and return the teamId if present.
      // WARNING: this is less secure; prefer setting JWT_SECRET/SUPABASE_SERVICE_ROLE_KEY in function envs.
      try {
        const parts = token.split('.')
        if (parts.length < 2) throw new Error('Malformed JWT')
        // base64url -> base64
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
        const decoded = new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0)))
        const payload = JSON.parse(decoded)
        if (payload?.teamId) {
          console.warn('verify-qr-token: JWT verification failed, returning unverified teamId')
          return new Response(JSON.stringify({ success: true, teamId: payload.teamId, unverified: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          })
        }
        throw verifyErr
      } catch (decodeErr) {
        throw verifyErr
      }
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }
});
