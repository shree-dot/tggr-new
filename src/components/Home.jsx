import React from "react";
import Header from "./Header";
import Menu from "./Menu.jsx";
import Upload from "./Upload";
import Manage from "./Manage";
import { Navigate, Route, Routes } from "react-router-dom";
import Create from "./Create.jsx";

const Home = () => {
  return (
    <div>
      <Header />
      <main
        id="main"
        role="main"
        className="container"
        style={{ maxWidth: "100%" }}
      >
        <Routes>
          <Route path="/" element={<Menu />} />
          <Route path="/upload/:tag?" element={<Upload />} />
          <Route path="/create" element={<Create />} />
          <Route path="/manage/:tag?" element={<Manage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default Home;
