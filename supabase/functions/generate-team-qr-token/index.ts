import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import * as jose from "https://deno.land/x/jose@v4.13.1/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET") || SUPABASE_SERVICE_ROLE_KEY; // Fallback to service key as secret

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
    if (!teamId) throw new Error("Team ID is required");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Generate a secure token
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new jose.SignJWT({ teamId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d") // Valid for 7 days
      .sign(secret);

    // 2. Update the teams table
    const { error: updateError } = await supabase
      .from("teams")
      .update({ qr_token: token })
      .eq("team_id", teamId);

    if (updateError) {
        // If column is missing, this will fail. We should notify the user.
        console.error("Update error:", updateError);
        throw new Error("Failed to update team token. Ensure 'qr_token' column exists in 'teams' table.");
    }

    return new Response(JSON.stringify({ success: true, token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
