import React, { useCallback, useContext } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import app from "../base.js";
import { AuthContext } from "../Auth.jsx";
import { Form, Button, Alert } from "./ui/compat";

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

  return (
    <div className="auth-shell">
      <header className="auth-topbar">
        <Link className="auth-brand" to="/login">
          Tggr
        </Link>
        <div className="auth-top-actions">
          <Link className="auth-top-link is-active" to="/login">
            Login
          </Link>
          <Link className="auth-top-link" to="/signup">
            Sign Up
          </Link>
        </div>
      </header>

      <div className="auth-content">
        <section className="auth-copy panel-shell">
          <p className="auth-kicker">Secure File Sharing</p>
          <h1 className="auth-title">Collaborate with tags, not messy links.</h1>
          <p className="auth-subtitle">
            Create controlled spaces for your team, upload fast, and manage everything in one
            streamlined workspace.
          </p>
          <Alert className="auth-demo-note">
            <strong>Try demo account:</strong>
            <br />
            test@test.com
            <br />
            test123
          </Alert>
        </section>

        <section className="auth-card login">
          <h2 className="head-login auth-form-title">Welcome Back</h2>
          <Form onSubmit={handleLogin}>
            <Form.Group controlId="formBasicEmail" className="create-field">
              <Form.Label className="create-label">Email Address</Form.Label>
              <Form.Control
                className="create-input"
                type="email"
                name="email"
                placeholder="Enter your email"
              />
              <Form.Text className="text-muted">
                We&apos;ll never share your email with anyone else.
              </Form.Text>
            </Form.Group>

            <Form.Group controlId="formBasicPassword" className="create-field">
              <Form.Label className="create-label">Password</Form.Label>
              <Form.Control
                className="create-input"
                name="password"
                type="password"
                placeholder="Enter your password"
              />
            </Form.Group>

            <Button id="cusbtn" variant="primary" type="submit" className="auth-submit-btn mt-3">
              Login
            </Button>
          </Form>
        </section>
      </div>
    </div>
  );
};

export default Login;
