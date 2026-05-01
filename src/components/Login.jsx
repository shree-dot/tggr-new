import React, { useCallback, useContext } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import app from "../base.js";
import { AuthContext } from "../Auth.jsx";
import PublicLanding from "./PublicLanding.jsx";

const Login = () => {
  const navigate = useNavigate();

  const handleLogin = useCallback(
    async (event) => {
      event.preventDefault();
      const { email, password } = event.target.elements;
      try {
        await app
          .auth()
          .signInWithEmailAndPassword(email.value, password.value);
        navigate("/");
      } catch (error) {
        alert(error);
      }
    },
    [navigate]
  );

  const { currentUser } = useContext(AuthContext);

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  return <PublicLanding mode="login" onSubmit={handleLogin} />;
};

export default Login;
