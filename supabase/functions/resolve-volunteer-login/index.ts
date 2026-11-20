
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "http://localhost:5173",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return reply({ ok: false, message: "Method not allowed." }, 405);
  }

  try {
    const { identifier, password } = await req.json();

    if (
      typeof identifier !== "string" ||
      typeof password !== "string" ||
      identifier.trim().length < 3 ||
      password.length < 8
    ) {
      return reply({ ok: false, message: "Invalid login details." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const publishableKeys = JSON.parse(
      Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!
    );
    const secretKeys = JSON.parse(
      Deno.env.get("SUPABASE_SECRET_KEYS")!
    );

    const publishableKey = publishableKeys.default;
    const secretKey = secretKeys.default;

    const value = identifier.trim();
    let column: string;
    let lookupValue: string;

    if (value.includes("@")) {
      column = "email";
      lookupValue = value.toLowerCase();
    } else if (/^[+\d\s().-]+$/.test(value)) {
      column = "mobile";
      lookupValue = value.replace(/\D/g, "");
    } else {
      column = "volunteer_code";
      lookupValue = value;
    }

    const lookupUrl = new URL(`${url}/rest/v1/volunteers`);
    lookupUrl.searchParams.set("select", "email,is_active");
    lookupUrl.searchParams.set(column, `eq.${lookupValue}`);
    lookupUrl.searchParams.set("limit", "1");

    const lookupResponse = await fetch(lookupUrl, {
      headers: {
        apikey: secretKey,
        Accept: "application/json",
      },
    });

    if (!lookupResponse.ok) {
      console.error("Volunteer lookup failed:", lookupResponse.status);
      return reply({ ok: false, message: "Unable to sign in. Please try again." }, 500);
    }

    const rows = await lookupResponse.json();
    const volunteer = rows?.[0];

    if (!volunteer || !volunteer.is_active) {
      return reply({ ok: false, message: "Invalid login details." }, 401);
    }

    const authResponse = await fetch(
      `${url}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publishableKey,
        },
        body: JSON.stringify({
          email: volunteer.email,
          password,
        }),
      }
    );

    const authResult = await authResponse.json();

    if (!authResponse.ok) {
      return reply({ ok: false, message: "Invalid login details." }, 401);
    }

    return reply({
      ok: true,
      session: {
        access_token: authResult.access_token,
        refresh_token: authResult.refresh_token,
      },
    });
  } catch (error) {
    console.error("Login function error:", error);
    return reply({
      ok: false,
      message: "Unable to sign in. Please try again.",
    }, 500);
  }
});
