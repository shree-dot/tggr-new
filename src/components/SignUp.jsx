import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PublicLanding from "./PublicLanding.jsx";
import app from "../base";

const SignUp = () => {
  const navigate = useNavigate();

  const handleSignUp = useCallback(
    async (event) => {
      event.preventDefault();
      const { email, password, name } = event.target.elements;
      try {
        await app
          .auth()
          .createUserWithEmailAndPassword(email.value, password.value);
        const db = app.firestore();
        db.collection("users").add({
          name: name.value,
          photoURL: "",
          uid: app.auth().currentUser.uid,
          notis: [],
        });
        navigate("/");
      } catch (error) {
        alert(error);
      }
    },
    [navigate]
  );

  return <PublicLanding mode="signup" onSubmit={handleSignUp} />;
};

export default SignUp;
