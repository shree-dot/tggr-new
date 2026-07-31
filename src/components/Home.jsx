import React, { Suspense } from "react";
import Header from "./Header";
import Menu from "./Menu.jsx";
import Upload from "./Upload";
import Manage from "./Manage";
import Admin from "./Admin.jsx";
import { Navigate, Route, Routes } from "react-router-dom";
import Create from "./Create.jsx";

// The scanner drags in the OpenCV wasm build, so it stays out of the main
// bundle and is only fetched once someone actually opens /scan.
const Scanner = React.lazy(() => import("./Scanner.jsx"));
const Clipboard = React.lazy(() => import("./Clipboard.jsx"));

const Home = () => {
  return (
    <div>
      <Header />
      <main id="main" role="main" className="app-main">
        <Routes>
          <Route path="/" element={<Menu />} />
          <Route path="/upload/:tag?" element={<Upload />} />
          <Route path="/create" element={<Create />} />
          <Route
            path="/clipboard"
            element={
              <Suspense fallback={<p className="scanner-boot">Opening clipboard…</p>}>
                <Clipboard />
              </Suspense>
            }
          />
          <Route
            path="/scan"
            element={
              <Suspense fallback={<p className="scanner-boot">Opening scanner…</p>}>
                <Scanner />
              </Suspense>
            }
          />
          <Route path="/manage/:tag?" element={<Manage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default Home;
