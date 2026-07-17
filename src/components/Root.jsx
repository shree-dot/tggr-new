import React, { useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../Auth.jsx";
import PublicLanding from "./PublicLanding.jsx";
import Home from "./Home.jsx";
import api from "../api.js";

// The "/" route must always render real, public content immediately — no
// spinner-only frame, no client-side redirect to /login — so automated
// reviewers (and real visitors) can see what the app does without signing
// in. Logged-in users see the app dashboard instead, once the auth check
// resolves; logged-out (or still-checking) visitors see the marketing page.
const Root = () => {
  const navigate = useNavigate();
  const { currentUser, refreshUser } = useContext(AuthContext);

  const handleGoogleCredential = useCallback(
    async (credential) => {
      try {
        await api.googleLogin(credential);
        await refreshUser();
        navigate("/");
      } catch (error) {
        alert(error.message);
      }
    },
    [navigate, refreshUser]
  );

  if (currentUser) {
    return <Home />;
  }

  return <PublicLanding mode="login" onGoogleCredential={handleGoogleCredential} />;
};

export default Root;
