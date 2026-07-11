import React, { useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import PublicLanding from "./PublicLanding.jsx";
import api from "../api.js";
import { AuthContext } from "../Auth.jsx";

const SignUp = () => {
  const navigate = useNavigate();
  const { refreshUser } = useContext(AuthContext);

  const handleSignUp = useCallback(
    async (event) => {
      event.preventDefault();
      const { email, password, name } = event.target.elements;
      try {
        await api.signup(name.value, email.value, password.value);
        await refreshUser();
        navigate("/");
      } catch (error) {
        alert(error.message);
      }
    },
    [navigate, refreshUser]
  );

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

  return (
    <PublicLanding
      mode="signup"
      onSubmit={handleSignUp}
      onGoogleCredential={handleGoogleCredential}
    />
  );
};

export default SignUp;
