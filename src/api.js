// REST client for the self-hosted tggr server. Auth uses an httpOnly cookie,
// so every request just needs credentials: "include" and file/thumbnail URLs
// can be used directly in <a href> / <img src>.

// Hidden-tags vault token: memory only, never persisted, expires server-side
// in 15 minutes. Closing/refreshing the tab locks the vault again.
let vaultToken = null;

const request = async (path, options = {}) => {
  const headers = {};
  if (options.body) headers["Content-Type"] = "application/json";
  if (vaultToken) headers["X-Vault-Token"] = vaultToken;

  const res = await fetch(path, {
    credentials: "include",
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response body
  }

  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
};

// Files larger than this are sent in chunks so no single request exceeds the
// Cloudflare tunnel's 100MB body limit. Smaller files use one plain request.
const CHUNK_THRESHOLD = 80 * 1024 * 1024;
const CHUNK_SIZE = 8 * 1024 * 1024;

const randomUploadId = () => {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Fallback for non-secure contexts where crypto may be unavailable.
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.padEnd(24, "0");
  }
};

const uploadSingle = (tag, file, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/tags/${encodeURIComponent(tag)}/files`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({ bytesTransferred: event.loaded, totalBytes: event.total });
      }
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // ignore
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data?.error || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed (network error)"));

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });

const sendChunk = (tag, uploadId, index, blob, onChunkProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/tags/${encodeURIComponent(tag)}/uploads/${uploadId}/${index}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onChunkProgress) {
        onChunkProgress(event.loaded);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // ignore
        }
        reject(new Error(data?.error || `Chunk ${index} failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Chunk upload failed (network error)"));
    xhr.send(blob);
  });

const uploadChunked = async (tag, file, onProgress) => {
  const uploadId = randomUploadId();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let baseBytes = 0;

  for (let index = 0; index < totalChunks; index++) {
    const start = index * CHUNK_SIZE;
    const blob = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));

    // One retry per chunk to ride out transient network blips.
    let attempt = 0;
    for (;;) {
      try {
        await sendChunk(tag, uploadId, index, blob, (loaded) => {
          if (onProgress) {
            onProgress({ bytesTransferred: baseBytes + loaded, totalBytes: file.size });
          }
        });
        break;
      } catch (err) {
        if (attempt >= 1) throw err;
        attempt += 1;
      }
    }

    baseBytes += blob.size;
    if (onProgress) {
      onProgress({ bytesTransferred: baseBytes, totalBytes: file.size });
    }
  }

  return request(`/api/tags/${encodeURIComponent(tag)}/uploads/${uploadId}/complete`, {
    method: "POST",
    body: { filename: file.name, totalChunks },
  });
};

const api = {
  // --- auth ---
  getConfig: () => request("/api/config"),
  me: () => request("/api/auth/me"),
  googleLogin: (credential) =>
    request("/api/auth/google", { method: "POST", body: { credential } }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  deviceToken: () => request("/api/auth/device-token", { method: "POST" }),

  // --- tags ---
  myTags: (includeHidden = false) =>
    request(`/api/tags/mine${includeHidden ? "?include_hidden=1" : ""}`),
  getTag: (name) => request(`/api/tags/${encodeURIComponent(name)}`),
  createTag: ({ name, access, desc }) =>
    request("/api/tags", { method: "POST", body: { name, access, desc } }),
  deleteTag: (name) =>
    request(`/api/tags/${encodeURIComponent(name)}`, { method: "DELETE" }),
  requestAccess: (name) =>
    request(`/api/tags/${encodeURIComponent(name)}/request`, { method: "POST" }),

  // --- access requests (owner side) ---
  getRequests: () => request("/api/requests"),
  resolveRequest: (id, action) =>
    request(`/api/requests/${id}/resolve`, { method: "POST", body: { action } }),

  // --- favorites ---
  setFavorite: (tag, favorite) =>
    request("/api/me/favorites", { method: "PUT", body: { tag, favorite } }),

  // --- hidden-tags vault ---
  setVaultToken: (token) => {
    vaultToken = token || null;
  },
  hasVaultToken: () => !!vaultToken,
  // Media elements (<img>, <a>, <video>) can't send headers, so hidden-tag
  // file URLs carry the short-lived token as a query param instead.
  withVaultParam: (url) =>
    vaultToken && url
      ? `${url}${url.includes("?") ? "&" : "?"}vt=${encodeURIComponent(vaultToken)}`
      : url,
  vaultStatus: () => request("/api/vault/status"),
  vaultSetup: (password) =>
    request("/api/vault/setup", { method: "POST", body: { password } }),
  vaultUnlock: (password) =>
    request("/api/vault/unlock", { method: "POST", body: { password } }),
  vaultTags: () => request("/api/vault/tags"),
  hideTag: (tag) => request("/api/vault/hide", { method: "POST", body: { tag } }),
  unhideTag: (tag) => request("/api/vault/unhide", { method: "POST", body: { tag } }),

  // --- admin ---
  adminOverview: () => request("/api/admin/overview"),
  adminUsers: () => request("/api/admin/users"),
  adminUpdateUser: (uid, body) =>
    request(`/api/admin/users/${encodeURIComponent(uid)}`, { method: "PATCH", body }),

  // --- files ---
  listFiles: (tag) => request(`/api/tags/${encodeURIComponent(tag)}/files`),
  deleteFile: (tag, filename) =>
    request(
      `/api/tags/${encodeURIComponent(tag)}/files/${encodeURIComponent(filename)}`,
      { method: "DELETE" }
    ),
  renameFile: (tag, filename, newName) =>
    request(
      `/api/tags/${encodeURIComponent(tag)}/files/${encodeURIComponent(filename)}`,
      { method: "PATCH", body: { newName } }
    ),

  // Upload with progress via XHR (fetch has no upload progress events).
  // Large files are chunked so each request stays under the tunnel's 100MB cap.
  uploadFile: (tag, file, { onProgress } = {}) =>
    file.size > CHUNK_THRESHOLD
      ? uploadChunked(tag, file, onProgress)
      : uploadSingle(tag, file, onProgress),

};

export default api;
