
import { useEffect, useState } from "react";
import {
  LockKeyhole, Mail, ShieldCheck, Eye, EyeOff, HandHeart,
  LogOut, Bell, UserRound, ClipboardList,
  CalendarDays, CalendarCheck, FolderOpen, Home, ArrowLeft, Users, UserPlus
} from "lucide-react";
import { supabase, supabaseConfigured } from "./lib/supabase";

export default function App() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [inviteMode, setInviteMode] = useState(false);
  const [session, setSession] = useState(null);
  const [activePage, setActivePage] = useState("home");
  const [profile, setProfile] = useState(null);
const [dashboardData, setDashboardData] = useState({
  events: [],
  duties: [],
  announcements: [],
});
const [dashboardLoading, setDashboardLoading] = useState(false);
const [dashboardError, setDashboardError] = useState("");
  const [volunteers, setVolunteers] = useState([]);
  const [volunteersLoading, setVolunteersLoading] = useState(false);
  const [volunteerForm, setVolunteerForm] = useState({
    full_name: "",
    mobile: "",
    email: "",
    role: "volunteer",
  });
  const [volunteerMessage, setVolunteerMessage] = useState("");
  const [volunteerBusy, setVolunteerBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    
    if (!supabaseConfigured) {
      setCheckingSession(false);
      return;
    }

    let mounted = true;

    // Supabase invitation links return to the app with type=invite in the URL hash.
    // Show the password setup form after the SDK processes the invitation tokens.
    const initialAuthParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const initialAuthType = initialAuthParams.get("type");
    if (initialAuthType === "invite") {
      setInviteMode(true);
      setRecoveryMode(true);
    } else if (initialAuthType === "recovery") {
      setRecoveryMode(true);
    }

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (mounted) {
        if (error) console.error("Session check error:", error);
        setSession(data?.session ?? null);
        setCheckingSession(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      setSession(newSession);

      if (event === "PASSWORD_RECOVERY") {
        setInviteMode(false);
        setRecoveryMode(true);
        setMessage("");
      }

      // Invite links may emit SIGNED_IN after the URL token is exchanged.
      // Keep the password setup screen open until the volunteer chooses a password.
      if (event === "SIGNED_IN" && initialAuthType === "invite") {
        setInviteMode(true);
        setRecoveryMode(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
  if (!session?.user?.id) return;

  let cancelled = false;

  async function loadDashboard() {
    setDashboardLoading(true);
    setDashboardError("");

    try {
      const { data: volunteer, error: profileError } = await supabase
        .from("volunteers")
        .select("id, full_name, volunteer_code, mobile, email, role")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!volunteer) {
  throw new Error("Volunteer profile not found. Please check the volunteer record in Supabase.");
}
      if (cancelled) return;

      setProfile(volunteer);

      const [eventsResult, dutiesResult, announcementsResult] =
        await Promise.all([
          supabase
            .from("events")
            .select("id, title, description, starts_at, ends_at")
            .eq("is_active", true)
            .order("starts_at", { ascending: true }),

          supabase
            .from("duty_assignments")
            .select(`
              assignment_type,
              duties (
                id, title, description, reporting_at,
                events (title, starts_at)
              )
            `)
            .eq("volunteer_id", volunteer.id),

          supabase
            .from("announcements")
            .select("id, title, body, is_pinned, published_at")
            .or(
              `audience.eq.all,and(audience.eq.individual,target_volunteer_id.eq.${volunteer.id})`
            )
            .order("published_at", { ascending: false })
            .limit(5),
        ]);

      if (eventsResult.error) throw eventsResult.error;
      if (dutiesResult.error) throw dutiesResult.error;
      if (announcementsResult.error) throw announcementsResult.error;

      if (!cancelled) {
        setDashboardData({
          events: eventsResult.data || [],
          duties: dutiesResult.data || [],
          announcements: announcementsResult.data || [],
        });
      }
    } catch (error) {
      console.error("Dashboard loading error:", error);
      if (!cancelled) {
        setDashboardError(error.message || "Could not load dashboard data.");
      }
    } finally {
      if (!cancelled) setDashboardLoading(false);
    }
  }

  loadDashboard();

  return () => {
    cancelled = true;
  };
}, [session?.user?.id]);

  useEffect(() => {
    const canManageVolunteers =
      profile && ["super_admin", "management"].includes(profile.role);

    if (activePage !== "volunteers" || !canManageVolunteers) return;

    let cancelled = false;

    async function loadVolunteers() {
      setVolunteersLoading(true);
      setVolunteerMessage("");

      const { data, error } = await supabase
        .from("volunteers")
        .select("id, volunteer_code, full_name, mobile, email, role, is_active")
        .order("volunteer_code", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Volunteer directory error:", error);
        setVolunteerMessage(
          "Could not load volunteers. Please check the admin read policy."
        );
      } else {
        setVolunteers(data || []);
      }

      setVolunteersLoading(false);
    }

    loadVolunteers();

    return () => {
      cancelled = true;
    };
  }, [activePage, profile?.role]);

  async function handleAddVolunteer(event) {
    event.preventDefault();
    setVolunteerMessage("");

    if (!["super_admin", "management"].includes(profile?.role)) {
      setVolunteerMessage("You are not authorized to add volunteers.");
      return;
    }

    setVolunteerBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "create-volunteer",
        { body: volunteerForm }
      );

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Volunteer could not be created.");
      }

      setVolunteerMessage(
        `Invitation sent. Volunteer ID: ${data.volunteer_code}`
      );
      setVolunteerForm({
        full_name: "",
        mobile: "",
        email: "",
        role: "volunteer",
      });

      const { data: refreshed, error: refreshError } = await supabase
        .from("volunteers")
        .select("id, volunteer_code, full_name, mobile, email, role, is_active")
        .order("volunteer_code", { ascending: true });

      if (!refreshError) setVolunteers(refreshed || []);
    } catch (error) {
      console.error("Add volunteer error:", error);
      setVolunteerMessage(error.message || "Could not add volunteer.");
    } finally {
      setVolunteerBusy(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setMessage("");

    if (!supabaseConfigured) {
      setMessage("Supabase is not connected. (Supabase कनेक्ट नहीं है।)");
      return;
    }

    if (!identifier.trim() || !password) {
      setMessage("Enter your login ID and password. (लॉगिन आईडी और पासवर्ड भरें।)");
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "resolve-volunteer-login",
        {
          body: {
            identifier: identifier.trim(),
            password,
          },
        }
      );

      if (error) throw error;

      if (
        !data?.ok ||
        !data?.session?.access_token ||
        !data?.session?.refresh_token
      ) {
        throw new Error(data?.message || "Invalid login details.");
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession(data.session);

      if (sessionError) throw sessionError;

      setSession(sessionData.session);
      setPassword("");
      setMessage("");
    } catch (error) {
      console.error("Login error:", error);
      setMessage(
        error.message ||
        "Unable to log in. Please try again. (लॉगिन नहीं हो पाया।)"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResetRequest() {
    setMessage("");

    if (!identifier.trim()) {
      setMessage(
        "Enter your registered Volunteer ID, mobile or email first. (पहले पंजीकृत आईडी, मोबाइल या ईमेल भरें।)"
      );
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "request-password-reset",
        {
          body: { identifier: identifier.trim() },
        }
      );

      if (error) throw error;

      setMessage(
        data?.message ||
        "If an account matches, a reset email will be sent. (यदि खाता मिला, तो रीसेट ईमेल भेजा जाएगा।)"
      );
    } catch (error) {
      console.error("Password reset request error:", error);
      setMessage(
        "Unable to request a reset. Please try again. (रीसेट अनुरोध नहीं हो पाया।)"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    setMessage("");

    if (newPassword.length < 8) {
      setMessage("Use at least 8 characters. (कम से कम 8 अक्षर रखें।)");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match. (दोनों पासवर्ड मेल नहीं खाते।)");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      await supabase.auth.signOut();

      setSession(null);
      setRecoveryMode(false);
      setInviteMode(false);
      setNewPassword("");
      setConfirmPassword("");
      setPassword("");
      setMessage(
        "Password updated. You can now log in. (पासवर्ड बदल गया है। अब लॉगिन करें।)"
      );
    } catch (error) {
      console.error("Password update error:", error);
      setMessage(
        error.message ||
        "Could not update password. (पासवर्ड नहीं बदला जा सका।)"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout error:", error);
      setMessage("Unable to log out. Please try again.");
    } else {
      setSession(null);
      setIdentifier("");
      setPassword("");
      setMessage("");
    }

    setBusy(false);
  }

  if (checkingSession) {
    return (
      <main className="grid min-h-screen place-items-center bg-mandir-cream">
        <p className="text-lg font-semibold text-mandir-deep">
          Loading… (लोड हो रहा है…)
        </p>
      </main>
    );
  }

  if (session && !recoveryMode) {
  const pages = {
    home: ["Dashboard", "सेवा पोर्टल"],
    duties: ["My Duties", "मेरी ड्यूटी"],
    events: ["Events", "आयोजन"],
    attendance: ["My Attendance", "मेरी उपस्थिति"],
    docs: ["Documents", "दस्तावेज़"],
    notifications: ["Notifications", "सूचनाएँ"],
    profile: ["My Profile", "मेरी प्रोफ़ाइल"],
    volunteers: ["Volunteer Management", "स्वयंसेवक प्रबंधन"],
  };

  const currentPage = pages[activePage] || pages.home;

  const dashboardItems = [
    { id: "duties", title: "My Duties", hindi: "मेरी ड्यूटी", icon: ClipboardList },
    { id: "events", title: "Event", hindi: "आयोजन", icon: CalendarDays },
    { id: "attendance", title: "My Attendance", hindi: "मेरी उपस्थिति", icon: CalendarCheck },
    { id: "docs", title: "Documents", hindi: "दस्तावेज़", icon: FolderOpen },
    ...(profile && ["super_admin", "management"].includes(profile.role)
      ? [{ id: "volunteers", title: "Manage Volunteers", hindi: "स्वयंसेवक प्रबंधन", icon: Users }]
      : []),
  ];

  const goTo = (page) => setActivePage(page);

  return (
    <main className="min-h-screen bg-mandir-cream px-4 py-6 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <header className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-mandir-deep to-mandir-saffron px-5 py-4 text-white shadow-sm sm:px-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/10">
              <HandHeart size={24} strokeWidth={1.8} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wide sm:text-base">
                SHRI LAXMI NARAYAN MANDIR
              </h2>
              <p className="mt-0.5 text-xs text-white/75 sm:text-sm">
                Model House, Jalandhar
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => goTo("notifications")}
              aria-label="Notifications"
              className="rounded-xl p-3 transition hover:bg-white/10"
            >
              <Bell size={21} strokeWidth={1.8} />
            </button>
            <button
              onClick={() => goTo("profile")}
              aria-label="Profile"
              className="rounded-xl p-3 transition hover:bg-white/10"
            >
              <UserRound size={21} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        {/* Main content */}
        <section className="mt-7 rounded-2xl border border-amber-100 bg-white p-5 shadow-sm sm:mt-9 sm:p-9">

          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mandir-saffron">
                VOLUNTEER PORTAL
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-mandir-ink sm:text-3xl">
                {activePage === "home"
                  ? `Welcome, ${profile?.full_name || "Volunteer"}`
                  : currentPage[0]}
              </h1>
              <p className="mt-1 text-sm text-stone-500">
                {currentPage[1]}
              </p>
            </div>

            {activePage !== "home" && (
              <button
                onClick={() => goTo("home")}
                className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Home</span>
              </button>
            )}
          </div>

          {dashboardLoading && (
            <p className="py-8 text-center text-sm text-stone-500">
              Loading information...
            </p>
          )}

          {dashboardError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {dashboardError}
            </div>
          )}

          {!dashboardLoading && activePage === "home" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
              {dashboardItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => goTo(item.id)}
                    className="group flex min-h-28 items-center gap-5 rounded-xl border border-stone-200 bg-white px-5 py-5 text-left transition duration-200 hover:border-amber-400 hover:bg-orange-50/50 hover:shadow-sm sm:px-7"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-mandir-saffron transition group-hover:bg-orange-100">
                      <Icon size={24} strokeWidth={1.7} />
                    </div>

                    <div className="flex-1">
                      <h3 className="font-semibold text-mandir-ink">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm text-stone-500">
                        {item.hindi}
                      </p>
                    </div>

                    <ArrowLeft
                      size={17}
                      className="rotate-180 text-stone-300 transition group-hover:text-mandir-saffron"
                    />
                  </button>
                );
              })}
            </div>
          )}

          {!dashboardLoading && activePage === "duties" && (
            <div className="space-y-4">
              {dashboardData.duties.length === 0 ? (
                <p className="rounded-xl bg-stone-50 p-5 text-sm text-stone-600">
                  No duties assigned yet. (अभी कोई ड्यूटी निर्धारित नहीं है।)
                </p>
              ) : dashboardData.duties.map((assignment, index) => (
                <div key={index} className="rounded-xl border border-stone-200 p-5">
                  <h3 className="font-semibold text-mandir-ink">
                    {assignment.duties?.title || "Duty"}
                  </h3>
                  <p className="mt-2 text-sm text-stone-600">
                    {assignment.duties?.description || "No description"}
                  </p>
                  <p className="mt-2 text-sm text-stone-500">
                    Reporting: {assignment.duties?.reporting_at
                      ? new Date(assignment.duties.reporting_at).toLocaleString()
                      : "Not specified"}
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    Assignment: {assignment.assignment_type}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!dashboardLoading && activePage === "events" && (
            <div className="space-y-4">
              {dashboardData.events.length === 0 ? (
                <p className="rounded-xl bg-stone-50 p-5 text-sm text-stone-600">
                  No active events available. (अभी कोई सक्रिय आयोजन नहीं है।)
                </p>
              ) : dashboardData.events.map((event) => (
                <div key={event.id} className="rounded-xl border border-stone-200 p-5">
                  <h3 className="font-semibold text-mandir-ink">{event.title}</h3>
                  <p className="mt-2 text-sm text-stone-600">
                    {event.description || "Event details will be updated."}
                  </p>
                  <p className="mt-2 text-sm text-stone-500">
                    {event.starts_at
                      ? new Date(event.starts_at).toLocaleString()
                      : "Date not specified"}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!dashboardLoading && activePage === "attendance" && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-6">
              <CalendarCheck className="mb-3 text-mandir-saffron" size={26} />
              <h3 className="font-semibold text-mandir-ink">Attendance Record</h3>
              <p className="mt-2 text-sm text-stone-500">
                Your attendance details will appear here.
                (आपकी उपस्थिति का विवरण यहाँ दिखाई देगा।)
              </p>
            </div>
          )}

          {!dashboardLoading && activePage === "docs" && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-6">
              <FolderOpen className="mb-3 text-mandir-saffron" size={26} />
              <h3 className="font-semibold text-mandir-ink">Mandir Documents</h3>
              <p className="mt-2 text-sm text-stone-500">
                Published documents will appear here.
                (प्रकाशित दस्तावेज़ यहाँ दिखाई देंगे।)
              </p>
            </div>
          )}

          {!dashboardLoading && activePage === "notifications" && (
            <div className="space-y-4">
              {dashboardData.announcements.length === 0 ? (
                <p className="rounded-xl bg-stone-50 p-5 text-sm text-stone-600">
                  No announcements yet. (अभी कोई सूचना नहीं है।)
                </p>
              ) : dashboardData.announcements.map((item) => (
                <div key={item.id} className="rounded-xl border border-stone-200 p-5">
                  <h3 className="font-semibold text-mandir-ink">{item.title}</h3>
                  <p className="mt-2 text-sm text-stone-600">{item.body}</p>
                  {item.is_pinned && (
                    <p className="mt-3 text-xs font-semibold text-mandir-saffron">
                      PINNED · महत्वपूर्ण
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {!dashboardLoading && activePage === "volunteers" &&
            profile && ["super_admin", "management"].includes(profile.role) && (
            <div className="space-y-8">
              <section className="rounded-xl border border-stone-200 p-5 sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="rounded-lg bg-orange-50 p-3 text-mandir-saffron">
                    <UserPlus size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-mandir-ink">Add Volunteer (स्वयंसेवक जोड़ें)</h3>
                    <p className="text-sm text-stone-500">
                      An invitation email will be sent so they can set their password.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleAddVolunteer} className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-stone-700">Full Name (पूरा नाम)</span>
                    <input
                      required
                      value={volunteerForm.full_name}
                      onChange={(e) => setVolunteerForm({ ...volunteerForm, full_name: e.target.value })}
                      className="min-h-12 w-full rounded-lg border border-stone-300 px-3 outline-none focus:border-mandir-gold"
                      placeholder="Volunteer full name"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-stone-700">Mobile (मोबाइल)</span>
                    <input
                      required
                      inputMode="numeric"
                      maxLength={15}
                      value={volunteerForm.mobile}
                      onChange={(e) => setVolunteerForm({ ...volunteerForm, mobile: e.target.value.replace(/\D/g, "") })}
                      className="min-h-12 w-full rounded-lg border border-stone-300 px-3 outline-none focus:border-mandir-gold"
                      placeholder="10–15 digits"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-stone-700">Email (ईमेल)</span>
                    <input
                      required
                      type="email"
                      value={volunteerForm.email}
                      onChange={(e) => setVolunteerForm({ ...volunteerForm, email: e.target.value })}
                      className="min-h-12 w-full rounded-lg border border-stone-300 px-3 outline-none focus:border-mandir-gold"
                      placeholder="name@example.com"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-stone-700">Role (भूमिका)</span>
                    <select
                      value={volunteerForm.role}
                      onChange={(e) => setVolunteerForm({ ...volunteerForm, role: e.target.value })}
                      className="min-h-12 w-full rounded-lg border border-stone-300 bg-white px-3 outline-none focus:border-mandir-gold"
                    >
                      {profile.role === "super_admin" && (
                        <option value="management">Management (प्रबंधन)</option>
                      )}
                      <option value="duty_head">Duty Head (ड्यूटी हेड)</option>
                      <option value="volunteer">Volunteer (स्वयंसेवक)</option>
                    </select>
                  </label>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={volunteerBusy}
                      className="min-h-12 rounded-lg bg-mandir-deep px-6 font-semibold text-white transition hover:bg-mandir-saffron disabled:opacity-60"
                    >
                      {volunteerBusy ? "Sending invitation…" : "Add Volunteer & Send Invite (जोड़ें और आमंत्रण भेजें)"}
                    </button>
                  </div>
                </form>

                {volunteerMessage && (
                  <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-mandir-deep">
                    {volunteerMessage}
                  </p>
                )}
              </section>

              <section>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-mandir-ink">Volunteer Directory (स्वयंसेवक सूची)</h3>
                    <p className="text-sm text-stone-500">All registered volunteer accounts</p>
                  </div>
                  <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-mandir-deep">
                    {volunteers.length} total
                  </span>
                </div>

                {volunteersLoading ? (
                  <p className="py-6 text-center text-sm text-stone-500">Loading volunteers…</p>
                ) : volunteers.length === 0 ? (
                  <p className="rounded-xl bg-stone-50 p-5 text-sm text-stone-600">
                    No volunteers found, or the directory read policy is not configured yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-stone-200">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead className="bg-stone-50 text-stone-600">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Volunteer ID</th>
                          <th className="px-4 py-3 font-semibold">Name</th>
                          <th className="px-4 py-3 font-semibold">Mobile</th>
                          <th className="px-4 py-3 font-semibold">Email</th>
                          <th className="px-4 py-3 font-semibold">Role</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {volunteers.map((volunteer) => (
                          <tr key={volunteer.id} className="border-t border-stone-100">
                            <td className="px-4 py-3 font-semibold text-mandir-deep">{volunteer.volunteer_code}</td>
                            <td className="px-4 py-3">{volunteer.full_name}</td>
                            <td className="px-4 py-3">{volunteer.mobile}</td>
                            <td className="px-4 py-3">{volunteer.email}</td>
                            <td className="px-4 py-3">{volunteer.role}</td>
                            <td className="px-4 py-3">{volunteer.is_active ? "Active" : "Inactive"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {!dashboardLoading && activePage === "profile" && (
            <div className="max-w-2xl space-y-3">
              {[
                ["Full Name", profile?.full_name],
                ["Volunteer ID", profile?.volunteer_code],
                ["Mobile", profile?.mobile],
                ["Email", profile?.email],
                ["Role", profile?.role],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap justify-between gap-2 border-b border-stone-100 py-4">
                  <span className="text-sm text-stone-500">{label}</span>
                  <span className="text-sm font-semibold text-mandir-ink">
                    {value || "Not available"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Footer navigation */}
        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 px-1">
          <button
            onClick={() => goTo("home")}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-white hover:text-mandir-deep"
          >
            <Home size={17} />
            Home
          </button>

          <button
            onClick={() => goTo("notifications")}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-white hover:text-mandir-deep"
          >
            <Bell size={17} />
            Notifications
          </button>

          <button
            onClick={handleLogout}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-mandir-deep px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-mandir-saffron disabled:opacity-60"
          >
            <LogOut size={16} />
            Logout
          </button>
        </footer>
      </div>
    </main>
  );
}

  return (
    <main className="min-h-screen bg-mandir-cream px-4 py-8 sm:py-12">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl overflow-hidden rounded-3xl bg-white shadow-soft lg:grid-cols-2">
        <section className="flex flex-col justify-between bg-gradient-to-br from-mandir-deep to-mandir-saffron p-8 text-white sm:p-10">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
              <HandHeart size={27} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">
                SHRI LAXMI NARAYAN MANDIR
              </p>
              <p className="text-xs text-white/75">Model House, Jalandhar</p>
            </div>
          </div>

          <div className="my-12">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[.2em] text-amber-100">
              Seva · सेवा
            </p>
            <h1 className="max-w-md text-4xl font-bold leading-tight sm:text-5xl">
              Together in service.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-8 text-white/85">
              A simple place to coordinate volunteers, duties and mandir events.
              <br />
              सेवा, व्यवस्था और आयोजनों के लिए एक सरल मंच।
            </p>
          </div>

          <p className="text-sm text-white/70">
            Volunteer Management (स्वयंसेवक प्रबंधन)
          </p>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-orange-50 text-mandir-saffron">
                <ShieldCheck size={25} />
              </div>

              <h2 className="text-3xl font-bold text-mandir-ink">
                {recoveryMode ? (inviteMode ? "Set your password" : "Create new password") : "Welcome back"}
              </h2>

              <p className="mt-2 text-base text-stone-600">
                {recoveryMode
                  ? (inviteMode
                    ? "Complete your volunteer account (अपना खाता पूरा करें)"
                    : "Reset Password (पासवर्ड रीसेट करें)")
                  : "Login (लॉगिन) to your volunteer account"}
              </p>
            </div>

            {recoveryMode ? (
              <form onSubmit={handlePasswordUpdate} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block font-semibold text-mandir-ink">
                    {inviteMode ? "Create Password (पासवर्ड बनाएँ)" : "New Password (नया पासवर्ड)"}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="min-h-14 w-full rounded-xl border border-stone-300 px-4 text-base outline-none focus:border-mandir-gold focus:ring-4 focus:ring-amber-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block font-semibold text-mandir-ink">
                    Confirm Password (पासवर्ड की पुष्टि करें)
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="min-h-14 w-full rounded-xl border border-stone-300 px-4 text-base outline-none focus:border-mandir-gold focus:ring-4 focus:ring-amber-100"
                  />
                </label>

                <button
                  disabled={busy}
                  className="min-h-14 w-full rounded-xl bg-mandir-saffron px-5 text-lg font-bold text-white disabled:opacity-60"
                >
                  {busy
                    ? "Please wait…"
                    : inviteMode
                      ? "Activate Account (खाता सक्रिय करें)"
                      : "Update Password (पासवर्ड बदलें)"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block font-semibold text-mandir-ink">
                    Volunteer ID / Mobile / Email (स्वयंसेवक आईडी / मोबाइल / ईमेल)
                  </span>
                  <span className="relative block">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
                    <input
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Enter any registered credential"
                      className="min-h-14 w-full rounded-xl border border-stone-300 bg-white pl-12 pr-4 text-base outline-none transition focus:border-mandir-gold focus:ring-4 focus:ring-amber-100"
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block font-semibold text-mandir-ink">
                    Password (पासवर्ड)
                  </span>
                  <span className="relative block">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
                    <input
                      autoComplete="current-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="min-h-14 w-full rounded-xl border border-stone-300 bg-white pl-12 pr-12 text-base outline-none transition focus:border-mandir-gold focus:ring-4 focus:ring-amber-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label="Toggle password visibility"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-500"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </span>
                </label>

                <div className="text-right">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleResetRequest}
                    className="min-h-10 text-sm font-semibold text-mandir-saffron underline-offset-4 hover:underline disabled:opacity-60"
                  >
                    Forgot Password? (पासवर्ड भूल गए?)
                  </button>
                </div>

                <button
                  disabled={busy}
                  className="min-h-14 w-full rounded-xl bg-mandir-saffron px-5 text-lg font-bold text-white shadow-sm transition hover:bg-mandir-deep disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? "Please wait… (कृपया प्रतीक्षा करें…)" : "Login (लॉगिन)"}
                </button>
              </form>
            )}

            {message && (
              <p role="status" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-mandir-deep">
                {message}
              </p>
            )}

            {!recoveryMode && (
              <div className="mt-8 rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-600">
                <strong className="text-mandir-ink">
                  Need access? (पहुँच चाहिए?)
                </strong>
                <br />
                Contact Mandir Management (मंदिर प्रबंधन से संपर्क करें) to activate your volunteer account.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
