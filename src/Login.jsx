// Login credentials — add more users here anytime
export const USERS = [
  {
    username: "admin",
    // Change this password — stored as plain text, fine for private app
    password: "nexus2024",
    displayName: "Admin",
    avatar: "A",
    role: "Owner",
    color: "#00d4ff",
  },
  {
    username: "axl",
    password: "axl2024",
    displayName: "Axl",
    avatar: "X",
    role: "Analyst",
    color: "#ff6b35",
  },
];

// Session helpers — keeps user logged in across page refreshes
export function saveSession(user) {
  try { localStorage.setItem("nexus_session", JSON.stringify({ username: user.username, ts: Date.now() })); } catch {}
}

export function loadSession() {
  try {
    const raw = localStorage.getItem("nexus_session");
    if (!raw) return null;
    const s = JSON.parse(raw);
    // Session expires after 7 days
    if (Date.now() - s.ts > 7 * 24 * 60 * 60 * 1000) { clearSession(); return null; }
    return USERS.find(u => u.username === s.username) || null;
  } catch { return null; }
}

export function clearSession() {
  try { localStorage.removeItem("nexus_session"); } catch {}
}

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = window.React.useState("");
  const [password, setPassword] = window.React.useState("");
  const [error, setError] = window.React.useState("");
  const [loading, setLoading] = window.React.useState(false);
  const [showPass, setShowPass] = window.React.useState(false);

  const handleLogin = () => {
    if (!username || !password) { setError("Enter username and password."); return; }
    setLoading(true); setError("");
    setTimeout(() => {
      const user = USERS.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
      if (user) { saveSession(user); onLogin(user); }
      else { setError("Invalid username or password."); setLoading(false); }
    }, 600);
  };

  const handleKey = (e) => { if (e.key === "Enter") handleLogin(); };

  return (
    <div style={{ background: "#03060d", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", position: "relative", overflow: "hidden" }}>
      <style>{`
        @keyframes scanline { 0%{top:-10%} 100%{top:110%} }
        @keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes gridMove { from{background-position:0 0} to{background-position:60px 60px} }
      `}</style>

      {/* Animated grid background */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(0,212,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.03) 1px,transparent 1px)", backgroundSize: "60px 60px", animation: "gridMove 8s linear infinite" }} />

      {/* Scanline */}
      <div style={{ position: "absolute", left: 0, right: 0, height: "3px", background: "linear-gradient(90deg,transparent,rgba(0,212,255,0.15),transparent)", animation: "scanline 4s linear infinite", pointerEvents: "none" }} />

      {/* Glow orbs */}
      <div style={{ position: "absolute", top: "20%", left: "15%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(0,212,255,0.06),transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "20%", right: "15%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,107,53,0.06),transparent 70%)", pointerEvents: "none" }} />

      {/* Login box */}
      <div style={{ position: "relative", width: 360, animation: "fadeIn 0.6s ease" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 36, letterSpacing: 10, color: "#00d4ff", textShadow: "0 0 30px rgba(0,212,255,0.5)", marginBottom: 6 }}>NEXUS</div>
          <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: 6, color: "#4a6d8c", textTransform: "uppercase" }}>Global Intelligence</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#39ff14", display: "inline-block", animation: "pulseDot 2s infinite" }} />
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#39ff14", letterSpacing: 3 }}>SYSTEM ONLINE</span>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: "#080f1a", border: "1px solid #1a2d47", borderRadius: 6, padding: 32, boxShadow: "0 0 60px rgba(0,0,0,0.6), 0 0 30px rgba(0,212,255,0.05)" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: 4, color: "#4a6d8c", textTransform: "uppercase", marginBottom: 24, textAlign: "center" }}>SECURE ACCESS</div>

          {/* Username */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#4a6d8c", letterSpacing: 2, marginBottom: 6 }}>USERNAME</div>
            <input
              value={username}
              onChange={e => { setUsername(e.target.value); setError(""); }}
              onKeyDown={handleKey}
              autoFocus
              placeholder="Enter username"
              style={{ width: "100%", background: "#0d1829", border: "1px solid #1a2d47", borderRadius: 3, padding: "10px 14px", color: "#e8f4ff", fontSize: 13, fontFamily: "monospace", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
              onFocus={e => e.target.style.borderColor = "#00d4ff"}
              onBlur={e => e.target.style.borderColor = "#1a2d47"}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#4a6d8c", letterSpacing: 2, marginBottom: 6 }}>PASSWORD</div>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                onKeyDown={handleKey}
                placeholder="Enter password"
                style={{ width: "100%", background: "#0d1829", border: "1px solid #1a2d47", borderRadius: 3, padding: "10px 40px 10px 14px", color: "#e8f4ff", fontSize: 13, fontFamily: "monospace", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
                onFocus={e => e.target.style.borderColor = "#00d4ff"}
                onBlur={e => e.target.style.borderColor = "#1a2d47"}
              />
              <button onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#4a6d8c", cursor: "pointer", fontSize: 14, padding: 4 }}>
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: "rgba(255,45,85,0.1)", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 3, padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#ff2d55", marginBottom: 16, textAlign: "center" }}>
              ⚠ {error}
            </div>
          )}

          {/* Login button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{ width: "100%", background: loading ? "#1a2d47" : "linear-gradient(135deg,#0066aa,#00d4ff)", color: loading ? "#4a6d8c" : "#03060d", border: "none", borderRadius: 3, padding: "12px", fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", fontFamily: "monospace", transition: "all 0.2s" }}
          >
            {loading ? "AUTHENTICATING..." : "ACCESS NEXUS ▶"}
          </button>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 20, fontFamily: "monospace", fontSize: 10, color: "#1a2d47" }}>
          NEXUS GLOBAL INTELLIGENCE · RESTRICTED ACCESS
        </div>
      </div>
    </div>
  );
}
