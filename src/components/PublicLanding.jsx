import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  File,
  Heart,
  Mail,
  Share2,
  Sparkles,
} from "lucide-react";
import { Button, Form } from "./ui/compat";

const workflowCards = [
  {
    number: "01.",
    title: "Organize with Tags",
    text: "Create tags for any purpose and keep all related files together. No more digging through unorganized folders.",
    image: "/landing/sun.png",
    chips: ["Projects", "Personal", "Work", "Study", "Travel", "Ideas"],
  },
  {
    number: "02.",
    title: "Share in an Instant",
    text: "Share a tag name with your team or friends. They can start uploading files immediately with the access rules you choose.",
    image: "/landing/hexagon.png",
    chips: ["Team Sync", "Client Work", "Events", "Group Study", "Family", "More"],
  },
  {
    number: "03.",
    title: "Collaborate Seamlessly",
    text: "Everyone with the tag can contribute. Stay in sync and get work done together, faster and easier.",
    image: "/landing/triangles.png",
    chips: ["Real-time", "Simple", "Secure", "Efficient", "Connected", "Unified"],
  },
];

const PublicLanding = ({ mode, onSubmit }) => {
  const isSignup = mode === "signup";
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
          <img src="/landing/tggr.png" alt="Tggr" />
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

          <Form onSubmit={onSubmit}>
            {isSignup && (
              <Form.Group className="public-auth-field">
                <Form.Label>Name</Form.Label>
                <Form.Control name="name" type="text" placeholder="Full Name" required />
              </Form.Group>
            )}
            <Form.Group className="public-auth-field">
              <Form.Label>Email Address</Form.Label>
              <Form.Control name="email" type="email" placeholder="Enter your email" required />
            </Form.Group>
            <Form.Group className="public-auth-field">
              <Form.Label>Password</Form.Label>
              <Form.Control name="password" type="password" placeholder="Enter your password" required />
            </Form.Group>

            <Button type="submit" className="public-auth-submit">
              {isSignup ? "Sign Up" : "Login"}
            </Button>
          </Form>
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
            <img className="public-work-art" src={card.image} alt="" aria-hidden="true" />
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
            <img src="/landing/tggr.png" alt="Tggr" />
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
