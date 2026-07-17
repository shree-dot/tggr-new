import React, { useCallback, useEffect, useState } from "react";
import api from "./api.js";
export const AuthContext = React.createContext();

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
      return user;
    } catch {
      setCurrentUser(null);
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
