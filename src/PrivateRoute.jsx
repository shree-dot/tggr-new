import React, { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "./Auth";
import { Spinner } from "./components/ui/compat";

const PrivateRoute = ({ children }) => {
  const { currentUser, pending } = useContext(AuthContext);

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

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default PrivateRoute