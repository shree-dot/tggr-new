import React, { useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext, SESSION_HINT_KEY } from "../Auth.jsx";
import PublicLanding from "./PublicLanding.jsx";
import Home from "./Home.jsx";
import api from "../api.js";
import { Spinner } from "./ui/compat";

// The "/" route must always render real, public content immediately — no
// spinner-only frame, no client-side redirect to /login — so automated
// reviewers (and first-time or signed-out visitors) can see what the app
// does without signing in. Logged-in users see the app dashboard instead,
// once the auth check resolves.
const Root = () => {
  const navigate = useNavigate();
  const { currentUser, pending, refreshUser } = useContext(AuthContext);

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

  // A returning user who was signed in last time avoids a flash of the
  // marketing page while their session is reconfirmed. First-time or
  // signed-out visitors — with no such hint stored — never hit this branch,
  // so the public page still renders instantly and unconditionally for them.
  const hadSession =
    typeof window !== "undefined" && localStorage.getItem(SESSION_HINT_KEY) === "1";

  if (pending && hadSession) {
    return (
      <div style={{ width: "100%" }}>
        <Spinner
          animation="border"
          variant="success"
          style={{
            position: "absolute",
            height: "50px",
            width: "50px",
            top: "20%",
            left: "50%",
            marginLeft: "-25px",
            marginTop: "-25px",
          }}
        />
      </div>
    );
  }

  return <PublicLanding mode="login" onGoogleCredential={handleGoogleCredential} />;
};

export default Root;
