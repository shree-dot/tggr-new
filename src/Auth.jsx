import React, { useCallback, useEffect, useState } from "react";
import api from "./api.js";
export const AuthContext = React.createContext();

// Non-sensitive local hint: "this browser was signed in last time we
// checked". Used only to avoid a UI flash for returning users — never used
// for actual auth decisions (the httpOnly session cookie is what matters).
export const SESSION_HINT_KEY = "tggr_had_session";

// Note: this provider never blocks rendering on the auth check. The public
// home page must show real content immediately (no spinner, no redirect) —
// only routes wrapped in PrivateRoute wait on `pending`.
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [pending, setPending] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await api.me();
      setCurrentUser(user);
      if (user) {
        localStorage.setItem(SESSION_HINT_KEY, "1");
      } else {
        localStorage.removeItem(SESSION_HINT_KEY);
      }
      return user;
    } catch {
      setCurrentUser(null);
      localStorage.removeItem(SESSION_HINT_KEY);
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setCurrentUser(null);
      localStorage.removeItem(SESSION_HINT_KEY);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        pending,
        refreshUser,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
