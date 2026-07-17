import React from "react";
import { Link } from "react-router-dom";
import api from "../api.js";
import {
  ArrowRight,
  File,
  Heart,
  Mail,
  Share2,
  Sparkles,
} from "lucide-react";

const workflowCards = [
  {
    number: "01.",
    title: "Organize with Tags",
    text: "Create tags for any purpose and keep all related files together. No more digging through unorganized folders.",
    image: "/landing/sun.webp",
    chips: ["Projects", "Personal", "Work", "Study", "Travel", "Ideas"],
  },
  {
    number: "02.",
    title: "Share in an Instant",
    text: "Share a tag name with your team or friends. They can start uploading files immediately with the access rules you choose.",
    image: "/landing/hexagon.webp",
    chips: ["Team Sync", "Client Work", "Events", "Group Study", "Family", "More"],
  },
  {
    number: "03.",
    title: "Collaborate Seamlessly",
    text: "Everyone with the tag can contribute. Stay in sync and get work done together, faster and easier.",
    image: "/landing/triangles.webp",
    chips: ["Real-time", "Simple", "Secure", "Efficient", "Connected", "Unified"],
  },
];

const GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";

// "Scatter -> order" flow field: frayed light-trails (loose files) that
// converge into a neatly indexed rack — an abstract of what tggr does.
// Static at rest; on hover the chaotic side drifts toward the cursor with
// depth parallax while the ordered side stays almost still.
const FlowBackdrop = ({ anchor = "right" }) => {
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    const section = wrap?.parentElement;
    if (!wrap || !section) {
      return;
    }
    if (
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const onMove = (e) => {
      const rect = section.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const my = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      wrap.style.setProperty("--mx", mx.toFixed(3));
      wrap.style.setProperty("--my", my.toFixed(3));
    };
    const onLeave = () => {
      wrap.style.setProperty("--mx", "0");
      wrap.style.setProperty("--my", "0");
    };

    section.addEventListener("pointermove", onMove);
    section.addEventListener("pointerleave", onLeave);
    return () => {
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const isHero = anchor === "right";

  // Hand-tuned stream bundles. Each stream starts scattered on the left and
  // docks at an evenly-spaced slot on the right (hero) or passes through a
  // central "index" and exits perfectly parallel (band).
  const heroStreams = [
    { sy: 520, wob1: -70, wob2: 30, w: 1.4, o: 0.7 },
    { sy: 210, wob1: 90, wob2: -40, w: 1.0, o: 0.4 },
    { sy: 620, wob1: -110, wob2: 50, w: 1.2, o: 0.55 },
    { sy: 340, wob1: 60, wob2: -25, w: 1.8, o: 0.95 },
    { sy: 260, wob1: 80, wob2: -50, w: 1.3, o: 0.65 },
    { sy: 580, wob1: -90, wob2: 20, w: 1.1, o: 0.45 },
  ];
  const bandStreams = [
    { sy: 96, w: 1.2, o: 0.5 },
    { sy: 292, w: 1.6, o: 0.8 },
    { sy: 158, w: 1.0, o: 0.4 },
    { sy: 244, w: 1.4, o: 0.6 },
  ];

  // Loose "file chips" drifting on the chaotic side: x, y, rotation, size.
  const heroChips = [
    [170, 555, -12, 16],
    [95, 300, 8, 13],
    [300, 240, -7, 14],
    [250, 620, 14, 12],
    [390, 500, -15, 11],
  ];
  const bandChips = [
    [180, 118, -12, 13],
    [330, 296, 9, 12],
    [240, 208, -6, 11],
    [110, 256, 14, 10],
  ];
  const heroStray = [
    [140, 430, 1.6],
    [330, 350, 1.3],
    [60, 500, 1.4],
    [220, 380, 1.1],
  ];

  // Depth class: chaos drifts the most on hover, the ordered side barely moves.
  const depthClass = (o) => (o >= 0.7 ? "ring ring-2" : o >= 0.5 ? "ring ring-3" : "ring ring-4");

  const heroEndY = (i) => 290 + i * 38;
  const bandEndY = (i) => 158 + i * 26;

  return (
    <div ref={wrapRef} className={`rings-backdrop rings-${anchor}`} aria-hidden="true">
      <svg
        viewBox={isHero ? "0 0 1200 800" : "0 0 1600 400"}
        preserveAspectRatio={isHero ? "xMaxYMid slice" : "xMidYMid slice"}
      >
        <defs>
          <linearGradient id={`stream-${anchor}`} x1="0" y1="0" x2="1" y2="0">
            {isHero ? (
              <>
                <stop offset="0%" stopColor="#c8ff72" stopOpacity="0" />
                <stop offset="55%" stopColor="#7fb75a" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#eaffbe" stopOpacity="0.9" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#c8ff72" stopOpacity="0" />
                <stop offset="70%" stopColor="#7fb75a" stopOpacity="0.18" />
                <stop offset="90%" stopColor="#eaffbe" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#c8ff72" stopOpacity="0.45" />
              </>
            )}
          </linearGradient>
          <filter id={`soft-${anchor}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <pattern id={`dotgrid-${anchor}`} width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="13" cy="13" r="1.2" fill="#7fb75a" />
          </pattern>
        </defs>

        {isHero ? (
          <>
            {/* ordered side: dot-grid texture, index rail, docked slots */}
            <g className="ring-halo">
              <rect x="985" y="250" width="215" height="310" fill={`url(#dotgrid-${anchor})`} opacity="0.09" />
              <circle cx="1160" cy="400" r="95" fill="#c8ff72" opacity="0.05" filter={`url(#soft-${anchor})`} />
              <line x1="1166" y1="266" x2="1166" y2="534" stroke="#7fb75a" strokeOpacity="0.35" strokeWidth="1" />
              {heroStreams.map((s, i) => (
                <g key={`slot-${i}`}>
                  <line
                    x1="1160" y1={heroEndY(i)} x2="1172" y2={heroEndY(i)}
                    stroke="#c8ff72" strokeOpacity="0.55" strokeWidth="1.5"
                  />
                  <circle cx="1150" cy={heroEndY(i)} r="2" fill="#eaffbe" opacity={0.35 + s.o * 0.6} />
                </g>
              ))}
            </g>

            {/* streams: chaos on the left easing into the rack */}
            {heroStreams.map((s, i) => {
              const d = `M -40 ${s.sy} C 430 ${s.sy + s.wob1}, 780 ${heroEndY(i) + s.wob2}, 1150 ${heroEndY(i)}`;
              return (
                <g key={`stream-${i}`} className={depthClass(s.o)}>
                  {s.o >= 0.7 && (
                    <path d={d} fill="none" stroke={`url(#stream-${anchor})`} strokeWidth={s.w * 5}
                      opacity={s.o * 0.28} filter={`url(#soft-${anchor})`} />
                  )}
                  <path d={d} fill="none" stroke={`url(#stream-${anchor})`} strokeWidth={s.w} opacity={s.o} />
                </g>
              );
            })}

            {/* chaotic side: stray file chips + dust */}
            <g className="ring ring-1">
              {heroChips.map(([x, y, rot, size], i) => (
                <rect
                  key={`chip-${i}`} x={x} y={y} width={size} height={size * 0.78} rx="3"
                  transform={`rotate(${rot} ${x} ${y})`}
                  fill="#c8ff72" fillOpacity="0.05" stroke="#7fb75a" strokeOpacity="0.4" strokeWidth="1"
                />
              ))}
              {heroStray.map(([x, y, r], i) => (
                <circle key={`dust-${i}`} cx={x} cy={y} r={r} fill="#7fb75a" opacity="0.5" />
              ))}
            </g>
          </>
        ) : (
          <>
            {/* the index sits past the content, at the band's right edge */}
            <g className="ring-halo">
              <circle cx="1470" cy="195" r="60" fill="#c8ff72" opacity="0.05" filter={`url(#soft-${anchor})`} />
              <line x1="1470" y1="140" x2="1470" y2="252" stroke="#7fb75a" strokeOpacity="0.35" strokeWidth="1" />
              {bandStreams.map((s, i) => (
                <circle key={`node-${i}`} cx="1470" cy={bandEndY(i)} r="1.6" fill="#eaffbe" opacity={0.3 + s.o * 0.5} />
              ))}
            </g>

            {bandStreams.map((s, i) => {
              const d = `M -40 ${s.sy} C 520 ${s.sy}, 1020 ${bandEndY(i)}, 1470 ${bandEndY(i)} L 1660 ${bandEndY(i)}`;
              return (
                <g key={`stream-${i}`} className={depthClass(s.o)}>
                  {s.o >= 0.8 && (
                    <path d={d} fill="none" stroke={`url(#stream-${anchor})`} strokeWidth={s.w * 5}
                      opacity={s.o * 0.25} filter={`url(#soft-${anchor})`} />
                  )}
                  <path d={d} fill="none" stroke={`url(#stream-${anchor})`} strokeWidth={s.w} opacity={s.o} />
                </g>
              );
            })}

            {/* packets in transit, past the index only — square, no tilt */}
            <g className="ring-halo">
              <rect x="1520" y={bandEndY(1) - 4} width="8" height="8" rx="2"
                fill="#c8ff72" fillOpacity="0.1" stroke="#c8ff72" strokeOpacity="0.45" strokeWidth="1" />
              <rect x="1585" y={bandEndY(3) - 4} width="8" height="8" rx="2"
                fill="#c8ff72" fillOpacity="0.1" stroke="#c8ff72" strokeOpacity="0.4" strokeWidth="1" />
            </g>

            {/* chaotic entry: tilted loose chips */}
            <g className="ring ring-1">
              {bandChips.map(([x, y, rot, size], i) => (
                <rect
                  key={`chip-${i}`} x={x} y={y} width={size} height={size * 0.78} rx="3"
                  transform={`rotate(${rot} ${x} ${y})`}
                  fill="#c8ff72" fillOpacity="0.05" stroke="#7fb75a" strokeOpacity="0.4" strokeWidth="1"
                />
              ))}
            </g>
          </>
        )}
      </svg>
    </div>
  );
};

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const PublicLanding = ({ mode, onGoogleCredential }) => {
  const isSignup = mode === "signup";
  const googleButtonRef = React.useRef(null);
  const [googleState, setGoogleState] = React.useState("loading"); // loading | ready | unavailable

  React.useEffect(() => {
    if (!onGoogleCredential) {
      return;
    }

    let cancelled = false;

    const renderGoogleButton = (clientId) => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onGoogleCredential(response.credential),
      });
      // The real button is rendered invisibly on top of our themed one, so
      // clicks hit Google's iframe while the visuals stay on-theme.
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: isSignup ? "signup_with" : "signin_with",
      });
      setGoogleState("ready");
    };

    api
      .getConfig()
      .then(({ googleClientId }) => {
        if (cancelled) {
          return;
        }
        if (!googleClientId) {
          setGoogleState("unavailable");
          return;
        }
        if (window.google?.accounts?.id) {
          renderGoogleButton(googleClientId);
          return;
        }
        let script = document.querySelector(`script[src="${GSI_SCRIPT_URL}"]`);
        if (!script) {
          script = document.createElement("script");
          script.src = GSI_SCRIPT_URL;
          script.async = true;
          document.head.appendChild(script);
        }
        script.addEventListener("load", () => renderGoogleButton(googleClientId));
        script.addEventListener("error", () => !cancelled && setGoogleState("unavailable"));
      })
      .catch(() => {
        if (!cancelled) {
          setGoogleState("unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onGoogleCredential, isSignup]);
  const scrollToAuth = (event) => {
    event.preventDefault();
    document.getElementById("public-auth")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  return (
    <div className="public-landing">
      <nav className="public-landing-nav" aria-label="Landing navigation">
        <Link className="public-landing-brand" to="/login">
          <img src="/landing/tggr.webp" alt="Tggr" />
        </Link>

        <div className="public-landing-nav-links">
          <a href="#features">Features</a>
          <a href="#workflow">How It Works</a>
          <a href="#about">About</a>
        </div>

        <div className="public-landing-auth-links">
          <Link className={!isSignup ? "is-active" : ""} to="/login">Login</Link>
          <Link className={isSignup ? "is-active" : ""} to="/signup">Sign Up</Link>
        </div>
      </nav>

      <section className="public-landing-hero">
        <FlowBackdrop anchor="right" />
        <div className="public-landing-hero-copy">
          <h1>
            Organize. Share.
            <span>Instantly.</span>
          </h1>
          <p>
            Tggr helps you organize and share files across devices in an instant using simple, powerful tags.
          </p>
          <div className="public-landing-hero-actions">
            <Link className="public-landing-button public-landing-button-dark" to="/signup">
              Get Started
            </Link>
            <Link className="public-landing-icon-button" to="/login" aria-label="Log in">
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>

        <section id="public-auth" className="public-auth-card" aria-label={isSignup ? "Sign up form" : "Login form"}>
          <div className="public-auth-tabs">
            <Link className={!isSignup ? "is-active" : ""} to="/login">Login</Link>
            <Link className={isSignup ? "is-active" : ""} to="/signup">Sign Up</Link>
          </div>
          <h2>{isSignup ? "Create Account" : "Welcome Back"}</h2>
          <p>{isSignup ? "Start creating tags and sharing files in minutes." : "Log in to manage your tags, uploads, and requests."}</p>

          <div className="public-google-area">
            {googleState === "loading" && (
              <div className="public-google-status">Loading sign-in...</div>
            )}
            {googleState === "unavailable" && (
              <div className="public-google-status">
                Google Sign-In is unavailable right now. Check your connection or
                the server configuration.
              </div>
            )}
            <div
              className="public-google-wrap"
              style={{ display: googleState === "ready" ? "block" : "none" }}
            >
              <div className="public-google-visual" aria-hidden="true">
                <GoogleMark />
                <span>{isSignup ? "Sign up with Google" : "Continue with Google"}</span>
              </div>
              <div ref={googleButtonRef} className="public-google-real" />
            </div>
            <p className="public-google-hint">
              {isSignup
                ? "Your account is created from your Google profile — no passwords to remember."
                : "Sign in with the Google account linked to your files."}
            </p>
          </div>
        </section>

        <div className="public-landing-hero-visual" aria-hidden="true" />
      </section>

      <section id="features" className="public-landing-section">
        <div className="public-landing-section-head">
          <h2>
            Everything in its place.
            <span>Shared with ease.</span>
          </h2>
          <p>
            Create tags for any project, team, or purpose. Upload files, invite others with just the tag name, and start collaborating instantly.
          </p>
        </div>
      </section>

      <section id="workflow" className="public-landing-workflow" aria-label="How Tggr works">
        {workflowCards.map((card) => (
          <article className={`public-work-card public-work-card-${card.number.replace(".", "")}`} key={card.number}>
            <span className="public-work-number">{card.number}</span>
            <img className="public-work-art" src={card.image} alt="" aria-hidden="true" loading="lazy" decoding="async" />
            <div className="public-work-copy">
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </div>
            <div className="public-chip-grid">
              {card.chips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section id="pricing" className="public-landing-cta-band">
        <FlowBackdrop anchor="bottom" />
        <div>
          <span className="public-cta-art" aria-hidden="true">
            <Sparkles size={34} />
          </span>
          <h2>
            Stop searching.
            <span>Start tagging.</span>
          </h2>
        </div>
        <div>
          <p>Tggr makes file organization and collaboration effortless, so you can focus on what matters.</p>
          <div className="public-landing-hero-actions">
            <Link className="public-landing-button public-landing-button-dark" to="/signup" onClick={scrollToAuth}>
              Get Tggr Now
            </Link>
            <Link className="public-cta-arrow" to="/signup" onClick={scrollToAuth} aria-label="Go to login and signup">
              <ArrowRight size={19} />
            </Link>
          </div>
        </div>
      </section>

      <footer id="about" className="public-landing-footer">
        <div className="public-footer-brand">
          <Link className="public-landing-brand" to="/login">
            <img src="/landing/tggr.webp" alt="Tggr" />
          </Link>
          <p>Organize and share files across devices in an instant. With tags, everything just clicks.</p>
          <div className="public-socials">
            <span><Share2 size={16} /></span>
            <span><Mail size={16} /></span>
            <span><File size={16} /></span>
          </div>
        </div>

        <div className="public-footer-links">
          <div>
            <h3>Product</h3>
            <a href="#features">Features</a>
            <a href="#workflow">How It Works</a>
            <Link to="/signup">Get Tggr</Link>
          </div>
          <div>
            <h3>Resources</h3>
            <a href="#features">Help Center</a>
            <a href="#workflow">Guides</a>
            <a href="#about">Contact</a>
          </div>
          <div>
            <h3>Company</h3>
            <a href="#about">About Us</a>
            <a href="/privacy.html">Privacy Policy</a>
            <a href="/terms.html">Terms of Service</a>
          </div>
        </div>

        <div className="public-footer-bottom">
          <span>© 2026 Tggr. All rights reserved.</span>
          <span>
            Made with <Heart size={13} fill="currentColor" /> for better collaboration.
          </span>
        </div>
      </footer>
    </div>
  );
};

export default PublicLanding;
