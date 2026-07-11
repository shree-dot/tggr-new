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

// Vector ring backdrop replacing the old raster hero/footer images: crisp
// concentric arcs in theme greens that parallax toward the cursor, but only
// while the section is hovered (they ease back to rest on leave).
const RingsBackdrop = ({ anchor = "right" }) => {
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

  const isRight = anchor === "right";
  const cx = isRight ? 1120 : 600;
  const cy = isRight ? 190 : 760;
  const radii = [150, 265, 395, 540, 700];

  return (
    <div ref={wrapRef} className={`rings-backdrop rings-${anchor}`} aria-hidden="true">
      <svg
        viewBox="0 0 1200 800"
        preserveAspectRatio={isRight ? "xMaxYMid slice" : "xMidYMax slice"}
      >
        <defs>
          <linearGradient id={`ring-grad-${anchor}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c8ff72" stopOpacity="0.7" />
            <stop offset="40%" stopColor="#4a8a4f" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#c8ff72" stopOpacity="0.05" />
          </linearGradient>
          <radialGradient id={`ring-halo-${anchor}`}>
            <stop offset="0%" stopColor="#c8ff72" stopOpacity="0.12" />
            <stop offset="55%" stopColor="#173420" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#c8ff72" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle className="ring-halo" cx={cx} cy={cy} r={radii[4]} fill={`url(#ring-halo-${anchor})`} />
        {radii.map((r, i) => (
          <circle
            key={r}
            className={`ring ring-${i + 1}`}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={`url(#ring-grad-${anchor})`}
            strokeWidth={i < 2 ? 1.8 : 1.2}
          />
        ))}
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
        <RingsBackdrop anchor="right" />
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
        <RingsBackdrop anchor="bottom" />
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
            <a href="#about">Privacy Policy</a>
            <a href="#about">Terms of Service</a>
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
