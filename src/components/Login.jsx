import React, { useCallback, useContext } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import api from "../api.js";
import { AuthContext } from "../Auth.jsx";
import PublicLanding from "./PublicLanding.jsx";

const Login = () => {
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
    return <Navigate to="/" replace />;
  }

  return <PublicLanding mode="login" onGoogleCredential={handleGoogleCredential} />;
};

export default Login;
