// REST client for the self-hosted tggr server. Auth uses an httpOnly cookie,
// so every request just needs credentials: "include" and file/thumbnail URLs
// can be used directly in <a href> / <img src>.

const request = async (path, options = {}) => {
  const res = await fetch(path, {
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
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

const api = {
  // --- auth ---
  getConfig: () => request("/api/config"),
  me: () => request("/api/auth/me"),
  googleLogin: (credential) =>
    request("/api/auth/google", { method: "POST", body: { credential } }),
  logout: () => request("/api/auth/logout", { method: "POST" }),

  // --- tags ---
  myTags: () => request("/api/tags/mine"),
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

  // --- files ---
  listFiles: (tag) => request(`/api/tags/${encodeURIComponent(tag)}/files`),
  deleteFile: (tag, filename) =>
    request(
      `/api/tags/${encodeURIComponent(tag)}/files/${encodeURIComponent(filename)}`,
      { method: "DELETE" }
    ),

  // Upload with progress via XHR (fetch has no upload progress events).
  uploadFile: (tag, file, { onProgress } = {}) =>
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
    }),

  uploadThumbnail: async (tag, filename, blob) => {
    const res = await fetch(
      `/api/tags/${encodeURIComponent(tag)}/files/${encodeURIComponent(filename)}/thumbnail`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "image/webp" },
        body: blob,
      }
    );
    if (!res.ok) {
      throw new Error(`Thumbnail upload failed (${res.status})`);
    }
    return res.json();
  },
};

export default api;
