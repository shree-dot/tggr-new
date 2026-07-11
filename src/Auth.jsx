import React, { useCallback, useEffect, useState } from "react";
import api from "./api.js";
import { Spinner } from "./components/ui/compat";
export const AuthContext = React.createContext();

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

  if (pending) {
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

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        refreshUser,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
