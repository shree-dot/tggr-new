import React, { useContext, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Users,
  HardDrive,
  Files,
  Tags,
  ShieldCheck,
  Ban,
  RotateCcw,
} from "lucide-react";
import api from "../api.js";
import { AuthContext } from "../Auth.jsx";
import { Button, Modal, Spinner } from "./ui/compat";

const GB = 1024 * 1024 * 1024;

const fmtBytes = (bytes = 0) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
};

const fmtDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";

const StatTile = ({ icon, label, value, context, meter }) => (
  <div className="admin-stat-card">
    <div className="admin-stat-head">
      <span className="admin-stat-icon">{icon}</span>
      <span className="admin-stat-label">{label}</span>
    </div>
    <div className="admin-stat-value">{value}</div>
    {context && <div className="admin-stat-context">{context}</div>}
    {meter != null && (
      <div className="admin-meter" role="img" aria-label={`${Math.round(meter * 100)}% used`}>
        <div className="admin-meter-fill" style={{ width: `${Math.min(100, meter * 100)}%` }} />
      </div>
    )}
  </div>
);

// Per-user usage meter. Status color only signals state: lime = fine,
// amber = approaching limit, red = at/over limit. Unlimited users get a
// plain lime bar scaled against the largest user for comparison.
const UsageMeter = ({ bytesUsed, limitBytes, maxBytes }) => {
  const hasLimit = limitBytes > 0;
  const ratio = hasLimit
    ? bytesUsed / limitBytes
    : maxBytes > 0
      ? bytesUsed / maxBytes
      : 0;
  const state = !hasLimit ? "none" : ratio >= 1 ? "critical" : ratio >= 0.85 ? "warning" : "ok";

  return (
    <div className="admin-usage">
      <div className="admin-usage-text">
        <strong>{fmtBytes(bytesUsed)}</strong>
        <span className="admin-usage-limit">
          {hasLimit ? ` / ${fmtBytes(limitBytes)}` : " · no limit"}
        </span>
      </div>
      <div className="admin-meter">
        <div
          className={`admin-meter-fill admin-meter-${state}`}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
};

const Admin = () => {
  const { currentUser } = useContext(AuthContext);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [limitDrafts, setLimitDrafts] = useState({});
  const [savingUid, setSavingUid] = useState("");
  const [revokeCandidate, setRevokeCandidate] = useState(null);
  const [revoking, setRevoking] = useState(false);

  const load = async () => {
    try {
      const [{ totals, disk, recentFiles }, { users: userRows }] = await Promise.all([
        api.adminOverview(),
        api.adminUsers(),
      ]);
      setOverview({ totals, disk, recentFiles });
      setUsers(userRows);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxBytes = useMemo(
    () => users.reduce((max, u) => Math.max(max, u.bytesUsed), 0),
    [users]
  );

  if (!currentUser?.isAdmin) {
    return <Navigate to="/" replace />;
  }

  const saveLimit = async (user) => {
    const draft = limitDrafts[user.uid];
    if (draft === undefined) return;
    const gb = draft === "" ? 0 : Number(draft);
    if (!Number.isFinite(gb) || gb < 0) return;

    setSavingUid(user.uid);
    try {
      await api.adminUpdateUser(user.uid, { storageLimitGb: gb });
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === user.uid ? { ...u, storageLimitBytes: Math.round(gb * GB) } : u
        )
      );
      setLimitDrafts((prev) => {
        const next = { ...prev };
        delete next[user.uid];
        return next;
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingUid("");
    }
  };

  const toggleAccess = async (user, disabled) => {
    setRevoking(true);
    try {
      await api.adminUpdateUser(user.uid, { disabled });
      setUsers((prev) => prev.map((u) => (u.uid === user.uid ? { ...u, disabled } : u)));
      setOverview((prev) =>
        prev
          ? {
              ...prev,
              totals: {
                ...prev.totals,
                activeUsers: prev.totals.activeUsers + (disabled ? -1 : 1),
              },
            }
          : prev
      );
      setRevokeCandidate(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setRevoking(false);
    }
  };

  if (loading) {
    return (
      <div style={{ width: "100%", padding: "60px 0", textAlign: "center" }}>
        <Spinner animation="border" variant="success" style={{ width: 34, height: 34 }} />
      </div>
    );
  }

  if (error) {
    return <div className="admin-error">Failed to load admin data: {error}</div>;
  }

  const { totals, disk, recentFiles } = overview;
  const appShare = disk ? totals.bytes / disk.total : null;
  const diskUsed = disk ? disk.total - disk.free : null;

  return (
    <div className="admin-shell">
      <div className="admin-head">
        <div>
          <h1 className="admin-title">
            <ShieldCheck size={22} />
            Admin
          </h1>
          <p className="admin-subtitle">Usage, storage and user management for this server.</p>
        </div>
      </div>

      <div className="admin-stat-grid">
        <StatTile
          icon={<Users size={16} />}
          label="Users"
          value={totals.users}
          context={`${totals.activeUsers} active · ${totals.users - totals.activeUsers} revoked`}
        />
        <StatTile
          icon={<HardDrive size={16} />}
          label="Storage used"
          value={fmtBytes(totals.bytes)}
          context={
            disk
              ? `${fmtBytes(diskUsed)} of ${fmtBytes(disk.total)} on disk · ${fmtBytes(disk.free)} free`
              : "across all tags"
          }
          meter={appShare}
        />
        <StatTile
          icon={<Files size={16} />}
          label="Files"
          value={totals.files}
          context="stored on this server"
        />
        <StatTile
          icon={<Tags size={16} />}
          label="Tags"
          value={totals.tags}
          context="created by all users"
        />
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Users</h2>
          <span className="admin-panel-count">{users.length}</span>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Joined</th>
                <th>Tags</th>
                <th>Files</th>
                <th>Usage</th>
                <th>Limit (GB)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const draft = limitDrafts[user.uid];
                const limitValue =
                  draft !== undefined
                    ? draft
                    : user.storageLimitBytes
                      ? String(user.storageLimitBytes / GB)
                      : "";
                return (
                  <tr key={user.uid} className={user.disabled ? "is-revoked" : ""}>
                    <td>
                      <div className="admin-user-cell">
                        <span className="admin-user-avatar">{initials(user.name)}</span>
                        <div className="admin-user-meta">
                          <span className="admin-user-name">
                            {user.name}
                            {user.isAdmin && <em className="admin-chip">admin</em>}
                          </span>
                          <span className="admin-user-email">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="admin-cell-muted">{fmtDate(user.createdAt)}</td>
                    <td>{user.tagCount}</td>
                    <td>{user.fileCount}</td>
                    <td className="admin-usage-cell">
                      <UsageMeter
                        bytesUsed={user.bytesUsed}
                        limitBytes={user.storageLimitBytes}
                        maxBytes={maxBytes}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-limit-input"
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="∞"
                        value={limitValue}
                        disabled={savingUid === user.uid}
                        onChange={(e) =>
                          setLimitDrafts((prev) => ({ ...prev, [user.uid]: e.target.value }))
                        }
                        onBlur={() => saveLimit(user)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td>
                      {user.disabled ? (
                        <span className="admin-badge admin-badge-revoked">
                          <Ban size={11} /> Revoked
                        </span>
                      ) : (
                        <span className="admin-badge admin-badge-active">Active</span>
                      )}
                    </td>
                    <td>
                      {user.isAdmin ? (
                        <span className="admin-cell-muted">—</span>
                      ) : user.disabled ? (
                        <button
                          type="button"
                          className="admin-action admin-action-restore"
                          onClick={() => toggleAccess(user, false)}
                          disabled={revoking}
                        >
                          <RotateCcw size={12} /> Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-action admin-action-revoke"
                          onClick={() => setRevokeCandidate(user)}
                        >
                          <Ban size={12} /> Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {recentFiles.length > 0 && (
        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>Recent uploads</h2>
          </div>
          <div className="admin-recent-list">
            {recentFiles.map((file) => (
              <div className="admin-recent-row" key={`${file.tag}/${file.filename}/${file.uploaded_at}`}>
                <span className="admin-recent-name" title={file.filename}>{file.filename}</span>
                <span className="admin-recent-tag">#{file.tag}</span>
                <span className="admin-cell-muted">{file.uploaded_by}</span>
                <span className="admin-cell-muted">{fmtBytes(file.size)}</span>
                <span className="admin-cell-muted">{fmtDate(file.uploaded_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal
        show={Boolean(revokeCandidate)}
        onHide={() => !revoking && setRevokeCandidate(null)}
        size="sm"
        centered
      >
        <Modal.Header
          style={{ backgroundColor: "var(--surface)", color: "var(--danger)", border: "none" }}
        >
          <Modal.Title>
            <b>Revoke access?</b>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body
          style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}
        >
          <b>{revokeCandidate?.name}</b> ({revokeCandidate?.email}) will be signed out and
          unable to log in or access any files until restored. Their files and tags are
          kept.
        </Modal.Body>
        <Modal.Footer
          style={{ backgroundColor: "var(--surface)", border: "none" }}
        >
          <Button
            variant="secondary"
            onClick={() => setRevokeCandidate(null)}
            disabled={revoking}
            style={{ fontWeight: "bold" }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => toggleAccess(revokeCandidate, true)}
            disabled={revoking}
            style={{ fontWeight: "bold" }}
          >
            {revoking ? "Revoking..." : "Revoke Access"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default Admin;
