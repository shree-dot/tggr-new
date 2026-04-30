import React, { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Form, Button } from "./ui/compat";
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

  return (
    <div className="auth-shell">
      <header className="auth-topbar">
        <Link className="auth-brand" to="/login">
          Tggr
        </Link>
        <div className="auth-top-actions">
          <Link className="auth-top-link" to="/login">
            Login
          </Link>
          <Link className="auth-top-link is-active" to="/signup">
            Sign Up
          </Link>
        </div>
      </header>

      <div className="auth-content">
        <section className="auth-copy panel-shell">
          <p className="auth-kicker">Create Your Workspace</p>
          <h1 className="auth-title">Get started with private team sharing.</h1>
          <p className="auth-subtitle">
            Sign up once to create tags, upload files, and manage access for your collaborators.
          </p>
        </section>

        <section className="auth-card login">
          <h2 className="head-login auth-form-title">Create Account</h2>
          <Form onSubmit={handleSignUp}>
            <Form.Group controlId="formBasicEmail" className="create-field">
              <Form.Label className="create-label">Email Address</Form.Label>
              <Form.Control className="create-input" type="email" name="email" placeholder="Enter email" />
            </Form.Group>

            <Form.Group controlId="formBasicPassword" className="create-field">
              <Form.Label className="create-label">Password</Form.Label>
              <Form.Control className="create-input" name="password" type="password" placeholder="Password" />
            </Form.Group>

            <Form.Group controlId="formBasicName" className="create-field">
              <Form.Label className="create-label">Name</Form.Label>
              <Form.Control className="create-input" name="name" type="text" placeholder="Full Name" />
            </Form.Group>

            <Button id="cusbtn" variant="primary" type="submit" className="auth-submit-btn">
              Sign Up
            </Button>
          </Form>
        </section>
      </div>
    </div>
  );
};

export default SignUp;
