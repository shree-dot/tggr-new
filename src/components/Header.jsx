import React from "react";
import app from "../base";
import { Link, useLocation, useNavigate } from "react-router-dom";
import prof from "../svg/prof.png";
import firebase from "firebase/compat/app";
import { Menu, X, Bell, ChevronDown, LogOut } from "lucide-react";
import { Button } from "./ui/compat";

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = React.useState("");
  const [reqTags, setReqTags] = React.useState([]);
  const [reqNames, setReqNames] = React.useState([]);
  const [requests, setRequests] = React.useState([]);
  const [openNotifications, setOpenNotifications] = React.useState(false);
  const [openProfileMenu, setOpenProfileMenu] = React.useState(false);
  const [openMobileNav, setOpenMobileNav] = React.useState(false);
  const notiWrapRef = React.useRef(null);
  const profileWrapRef = React.useRef(null);

  React.useEffect(() => {
    const currentUser = app.auth().currentUser;
    if (!currentUser?.uid) {
      return;
    }

    const uid = currentUser.uid;
    const db = app.firestore();
    db.collection("tags")
      .where("owner", "==", uid)
      .get()
      .then(function (querySnapshot) {
        const nextReqTags = [];
        const nextReqNames = [];
        const nextRequests = [];

        querySnapshot.forEach(function (doc) {
          const data = doc.data() || {};
          const reqTags = Array.isArray(data.reqTags) ? data.reqTags : [];
          const reqNames = Array.isArray(data.reqNames) ? data.reqNames : [];
          const requests = Array.isArray(data.requests) ? data.requests : [];

          nextReqTags.push(...reqTags);
          nextReqNames.push(...reqNames);
          nextRequests.push(...requests);
        });

        setReqTags(nextReqTags);
        setReqNames(nextReqNames);
        setRequests(nextRequests);
      });
  }, []);

  React.useEffect(() => {
    const onClickOutside = (event) => {
      if (
        notiWrapRef.current &&
        !notiWrapRef.current.contains(event.target)
      ) {
        setOpenNotifications(false);
      }

      if (
        profileWrapRef.current &&
        !profileWrapRef.current.contains(event.target)
      ) {
        setOpenProfileMenu(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleSignOut = () => {
    app.auth().signOut();
    navigate("/");
  };

  const activeC = location.pathname.startsWith("/create")
    ? "activeTrue"
    : "activeFalse";
  const activeU = location.pathname.startsWith("/upload")
    ? "activeTrue"
    : "activeFalse";
  const activeM = location.pathname.startsWith("/manage")
    ? "activeTrue"
    : "activeFalse";

  const navClass = (stateClass) => `header-link ${stateClass}`;

  React.useEffect(() => {
    const currentUser = app.auth().currentUser;
    if (!currentUser?.uid) {
      return;
    }

    const uid = currentUser.uid;
    const db = app.firestore();
    db.collection("users")
      .where("uid", "==", uid)
      .get()
      .then(function (querySnapshot) {
        querySnapshot.forEach(function (doc) {
          setUser(doc.data().name);
        });
      });
  }, []);

  const acceptReq = (index) => {
    if (!reqNames[index] || !requests[index]) {
      return;
    }
    const db = app.firestore();
    let tagString = reqNames[index];
    let tag = tagString.split(" ").splice(-1);
    console.log(tag[0]);
    db.collection("tags")
      .where("name", "==", tag[0])
      .get()
      .then(function (querySnapshot) {
        querySnapshot.forEach(function (doc) {
          const ref = db.collection("tags").doc(doc.id);
          ref.update({
            users: firebase.firestore.FieldValue.arrayUnion(requests[index]),
          });
          ref.update({
            requests: firebase.firestore.FieldValue.arrayRemove(
              requests[index]
            ),
            reqNames: firebase.firestore.FieldValue.arrayRemove(
              reqNames[index]
            ),
          });
        });
      });

    setReqNames((prev) => prev.filter((_, i) => i !== index));
    setRequests((prev) => prev.filter((_, i) => i !== index));
    setReqTags((prev) => prev.filter((_, i) => i !== index));
  };

  const rejectReq = (index) => {
    if (!reqNames[index] || !requests[index]) {
      return;
    }

    const db = app.firestore();
    let tagString = reqNames[index];
    let tag = tagString.split(" ").splice(-1);
    console.log(tag[0]);
    db.collection("tags")
      .where("name", "==", tag[0])
      .get()
      .then(function (querySnapshot) {
        querySnapshot.forEach(function (doc) {
          const ref = db.collection("tags").doc(doc.id);
          ref.update({
            requests: firebase.firestore.FieldValue.arrayRemove(
              requests[index]
            ),
            reqNames: firebase.firestore.FieldValue.arrayRemove(
              reqNames[index]
            ),
          });
        });
      });

    setReqNames((prev) => prev.filter((_, i) => i !== index));
    setRequests((prev) => prev.filter((_, i) => i !== index));
    setReqTags((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="app-header-shell mb-5">
      <div className="app-header">
        <div className="app-header-left">
          {/* hamburger — only visible on mobile, stays far left */}
          <button
            className="app-hamburger"
            onClick={() => setOpenMobileNav((p) => !p)}
            aria-label="Toggle navigation"
          >
            {openMobileNav ? <X size={22} /> : <Menu size={22} />}
          </button>

          <Link className="app-brand" to="/">
            <img src="/landing/tggr.png" alt="Tggr" />
          </Link>
        </div>

        <div className="app-nav-links">
          <Link className={navClass(activeC)} to="/create">
            Create
          </Link>
          <Link className={navClass(activeU)} to="/upload">
            Upload
          </Link>
          <Link className={navClass(activeM)} to="/manage">
            Manage
          </Link>
        </div>

        <div className="app-header-actions">
          <div className="app-noti-wrap" ref={notiWrapRef}>
            <button
              className="app-noti-btn"
              type="button"
              onClick={() => {
                setOpenNotifications((prev) => !prev);
                setOpenProfileMenu(false);
              }}
              aria-label="Notifications"
              aria-expanded={openNotifications}
            >
              <Bell size={18} />
              <span className="app-noti-btn-label">Notifications</span>
              {reqNames.length > 0 && <span className="app-noti-dot" />}
            </button>

            {openNotifications && (
              <div id="notidd" className="app-noti-menu">
                {reqNames.length === 0 && (
                  <div id="dditem" className="app-noti-item">
                    <p style={{ margin: 0, fontWeight: "bold", color: "var(--text)" }}>No new notifications!</p>
                  </div>
                )}
                {reqNames.map((name, index) => (
                  <div key={index} id={index + "sup"} className="app-noti-item" style={{ textAlign: "center", color: "var(--text)" }}>
                    <span style={{ lineHeight: "1.4" }}>{name}</span>
                    <div className="mt-3" style={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}>
                      <Button size="sm" onClick={() => acceptReq(index)}>
                        Accept
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => rejectReq(index)}>
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="app-profile-wrap" ref={profileWrapRef}>
            <button
              className="app-profile-btn"
              type="button"
              onClick={() => {
                setOpenProfileMenu((prev) => !prev);
                setOpenNotifications(false);
              }}
              aria-label="Profile menu"
              aria-expanded={openProfileMenu}
            >
              <span className="app-profile-avatar">
                <img alt="profile" src={prof} />
              </span>
              <span className="app-profile-name">{user || "Profile"}</span>
              <ChevronDown size={14} className="app-profile-chevron" />
            </button>

            {openProfileMenu && (
              <div className="app-profile-menu">
                <div className="app-profile-menu-head">
                  <span className="app-profile-menu-title">Signed in as</span>
                  <strong>{user || "User"}</strong>
                </div>
                <button
                  className="app-profile-signout"
                  type="button"
                  onClick={handleSignOut}
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {openMobileNav && (
        <nav className="app-mobile-nav" onClick={() => setOpenMobileNav(false)}>
          <Link className={navClass(activeC)} to="/create">Create</Link>
          <Link className={navClass(activeU)} to="/upload">Upload</Link>
          <Link className={navClass(activeM)} to="/manage">Manage</Link>
          <button
            className="header-link"
            type="button"
            onClick={handleSignOut}
          >
            Sign Out
          </button>
        </nav>
      )}
    </div>
  );
};

export default Header;
