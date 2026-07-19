import React, { useMemo, useState } from "react";
import api from "../api.js";
import {
  Trash2,
  ExternalLink,
  Star,
  File,
  FileText,
  FileCode2,
  FileArchive,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  MoreVertical,
  Pencil,
  EyeOff,
  Eye,
  Lock,
} from "lucide-react";
import {
  Alert,
  Button,
  Fade,
  Form,
  FormControl,
  FormLabel,
  InputGroup,
  Modal,
  Spinner,
} from "./ui/compat";
import { useNavigate, useParams } from "react-router-dom";
import { splitFileName } from "../fileName.js";
import Lightbox, { isViewableName } from "./Lightbox.jsx";
import "../util.css";

const SORT_OPTIONS = {
  newest: "Newest first",
  oldest: "Oldest first",
  nameAsc: "Name A-Z",
  nameDesc: "Name Z-A",
  sizeDesc: "Size large-small",
  sizeAsc: "Size small-large",
};

const TAG_SORT_OPTIONS = {
  activityDesc: "Latest activity",
  nameAsc: "Name A-Z",
  nameDesc: "Name Z-A",
  dateDesc: "Newest tags",
  dateAsc: "Oldest tags",
};

const getTimeValue = (value) => {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const getTagCreatedTime = (tag) => getTimeValue(tag?.date || tag?.createdAt);

const getTagActivityTime = (tag) =>
  getTimeValue(tag?.lastActivityAt || tag?.updatedAt) || getTagCreatedTime(tag);

const Manage = () => {
  const navigate = useNavigate();
  const { tag: routeTag } = useParams();

  const decodedRouteTag = useMemo(
    () => (routeTag ? decodeURIComponent(routeTag) : ""),
    [routeTag]
  );

  const [tagname, setTagName] = useState("");
  const [files, setFiles] = useState([]);
  const [show, setShow] = useState("none");
  const [nones, setNones] = useState("none");
  const [nonesx, setNonesx] = useState("none");
  const [mones, setMones] = useState("none");
  const [pending, setPending] = useState("none");
  const [owner, setOwner] = useState("");
  const [ownerUid, setOwnerUid] = useState("");
  const [description, setDescription] = useState("");
  const [uid, setUID] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [empty, setEmpty] = useState("none");
  const [nempty, setnEmpty] = useState("block");
  const [mytags, setMyTags] = useState([]);
  const [requestModal, setRequestModal] = useState(false);
  const [reqModalSuccess, setReqModalSuccess] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [layout, setLayout] = useState("tiles");
  const [favoriteTags, setFavoriteTags] = useState([]);
  const [myTagQuery, setMyTagQuery] = useState("");
  const [tagSortBy, setTagSortBy] = useState("activityDesc");
  const [isTagSidebarOpen, setIsTagSidebarOpen] = useState(false);
  const [deleteTagCandidate, setDeleteTagCandidate] = useState(null);
  const [deletingTag, setDeletingTag] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [renameCandidate, setRenameCandidate] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameExt, setRenameExt] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(null);
  // Hidden-tags vault. The token itself lives in api.js memory only.
  const [vaultModal, setVaultModal] = useState(null); // null | "setup" | "unlock"
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultPassword2, setVaultPassword2] = useState("");
  const [vaultError, setVaultError] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [hiddenTags, setHiddenTags] = useState([]);
  // What to do once the vault unlocks: null = show the hidden-tags panel,
  // {type:"hide"|"open", name} = hide or open that tag.
  const [pendingAction, setPendingAction] = useState(null);
  const [currentTagHidden, setCurrentTagHidden] = useState(false);
  const loadFilesRequestIdRef = React.useRef(0);

  React.useEffect(() => {
    api
      .me()
      .then(({ user }) => {
        setUID(user.uid);
        setFavoriteTags(user.favoriteTags || []);
      })
      .catch((error) => console.log("User load error:", error));

    api
      .myTags()
      .then(({ tags }) => {
        setMyTags(tags);
        setLoading(false);
      })
      .catch((error) => {
        console.log("Tags load error:", error);
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    if (decodedRouteTag) {
      setTagName(decodedRouteTag);
      resolveTag(decodedRouteTag);
    }
  }, [decodedRouteTag]);


  const canonicalizeTagRoute = (tag) => {
    if (!tag) {
      return;
    }
    navigate(`/manage/${encodeURIComponent(tag)}`);
  };

  const resetTagState = () => {
    setEmpty("none");
    setnEmpty("block");
    setNones("none");
    setNonesx("none");
    setMones("none");
    setShow("none");
    setPending("block");
    setFiles([]);
    setLoadingFiles(true);
  };

  const getSize = (bytes) => {
    const units = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "n/a";
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
    if (i === 0) return `${bytes} ${units[i]}`;
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  const getCorrectDate = (dateValue) => {
    const date = new Date(dateValue);
    const year = date.getFullYear();
    let month = date.getMonth() + 1;
    let dt = date.getDate();

    if (dt < 10) dt = `0${dt}`;
    if (month < 10) month = `0${month}`;

    return `${dt}-${month}-${year}`;
  };

  const isImageFile = (filename) => {
    const lower = filename.toLowerCase();
    return (
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".gif") ||
      lower.endsWith(".webp") ||
      lower.endsWith(".bmp") ||
      lower.endsWith(".svg")
    );
  };

  const getFileExtension = (filename) => {
    const idx = filename.lastIndexOf(".");
    if (idx === -1 || idx === filename.length - 1) {
      return "";
    }
    return filename.slice(idx + 1).toLowerCase();
  };

  const getFileIconData = (filename) => {
    const ext = getFileExtension(filename);

    const iconMap = {
      pdf: { icon: <FileText size={22} />, color: "#ff7f92", label: "pdf" },
      doc: { icon: <FileText size={22} />, color: "#a8d5ff", label: "doc" },
      docx: { icon: <FileText size={22} />, color: "#a8d5ff", label: "doc" },
      txt: { icon: <FileText size={22} />, color: "#c0c0c0", label: "text" },
      rtf: { icon: <FileText size={22} />, color: "#a8d5ff", label: "doc" },
      md: { icon: <FileText size={22} />, color: "#f59e0b", label: "doc" },
      js: { icon: <FileCode2 size={22} />, color: "#fbbf24", label: "code" },
      jsx: { icon: <FileCode2 size={22} />, color: "#fbbf24", label: "code" },
      ts: { icon: <FileCode2 size={22} />, color: "#60a5fa", label: "code" },
      tsx: { icon: <FileCode2 size={22} />, color: "#60a5fa", label: "code" },
      json: { icon: <FileCode2 size={22} />, color: "#fbbf24", label: "code" },
      html: { icon: <FileCode2 size={22} />, color: "#f97316", label: "code" },
      css: { icon: <FileCode2 size={22} />, color: "#60a5fa", label: "code" },
      py: { icon: <FileCode2 size={22} />, color: "#3b82f6", label: "code" },
      java: { icon: <FileCode2 size={22} />, color: "#ef4444", label: "code" },
      c: { icon: <FileCode2 size={22} />, color: "#8b5cf6", label: "code" },
      cpp: { icon: <FileCode2 size={22} />, color: "#8b5cf6", label: "code" },
      csv: { icon: <FileSpreadsheet size={22} />, color: "#10b981", label: "sheet" },
      xls: { icon: <FileSpreadsheet size={22} />, color: "#10b981", label: "sheet" },
      xlsx: { icon: <FileSpreadsheet size={22} />, color: "#10b981", label: "sheet" },
      zip: { icon: <FileArchive size={22} />, color: "#f7d463", label: "archive" },
      rar: { icon: <FileArchive size={22} />, color: "#f7d463", label: "archive" },
      "7z": { icon: <FileArchive size={22} />, color: "#f7d463", label: "archive" },
      tar: { icon: <FileArchive size={22} />, color: "#f7d463", label: "archive" },
      gz: { icon: <FileArchive size={22} />, color: "#f7d463", label: "archive" },
      mp4: { icon: <FileVideo size={22} />, color: "#ec4899", label: "video" },
      mov: { icon: <FileVideo size={22} />, color: "#ec4899", label: "video" },
      mkv: { icon: <FileVideo size={22} />, color: "#ec4899", label: "video" },
      avi: { icon: <FileVideo size={22} />, color: "#ec4899", label: "video" },
      webm: { icon: <FileVideo size={22} />, color: "#ec4899", label: "video" },
      mp3: { icon: <FileAudio size={22} />, color: "#8b5cf6", label: "audio" },
      wav: { icon: <FileAudio size={22} />, color: "#8b5cf6", label: "audio" },
      aac: { icon: <FileAudio size={22} />, color: "#8b5cf6", label: "audio" },
      m4a: { icon: <FileAudio size={22} />, color: "#8b5cf6", label: "audio" },
      flac: { icon: <FileAudio size={22} />, color: "#8b5cf6", label: "audio" },
      ogg: { icon: <FileAudio size={22} />, color: "#8b5cf6", label: "audio" },
    };

    return iconMap[ext] || { icon: <File size={22} />, color: "#9daeba", label: "file" };
  };

  const getFileIcon = (filename) => {
    const data = getFileIconData(filename);
    return data.icon;
  };

  const getFileIconColor = (filename) => {
    const data = getFileIconData(filename);
    return data.color;
  };

  const loadFiles = async (tag, isHidden = false) => {
    const requestId = ++loadFilesRequestIdRef.current;
    setFiles([]);
    setLoadingFiles(true);

    try {
      const { files: loaded } = await api.listFiles(tag);

      if (requestId !== loadFilesRequestIdRef.current) {
        return;
      }

      if (!loaded.length) {
        setEmpty("block");
        setnEmpty("none");
        setLoadingFiles(false);
        return;
      }

      // Hidden-tag media can't send the vault header from <img>/<a>, so the
      // short-lived token rides along as a query param on those URLs.
      const mapped = isHidden
        ? loaded.map((f) => ({
            ...f,
            url: api.withVaultParam(f.url),
            thumbnailURL: f.thumbnailURL ? api.withVaultParam(f.thumbnailURL) : "",
          }))
        : loaded;

      setnEmpty("block");
      setFiles(mapped);
      setLoadingFiles(false);
    } catch (error) {
      console.log("Error loading files:", error);
      if (requestId === loadFilesRequestIdRef.current) {
        setLoadingFiles(false);
      }
    }
  };

  const resolveTag = async (name) => {
    if (!name) {
      return;
    }

    resetTagState();

    try {
      const info = await api.getTag(name);
      setPending("none");

      if (!info.exists) {
        setNones("block");
        setNonesx("none");
        setMones("none");
        setShow("none");
        return;
      }

      if (!info.allowed) {
        setNonesx("block");
        setMones("none");
        setShow("none");
        return;
      }

      // Hidden tag whose contents are locked: the owner gets an unlock
      // prompt that re-resolves on success; anyone else is treated as
      // having no viewing permission (uploads still work elsewhere).
      if (info.contentLocked) {
        if (info.isOwner) {
          startVault({ type: "open", name });
        } else {
          setNonesx("block");
          setMones("none");
          setShow("none");
        }
        return;
      }

      setMones("block");
      setNones("none");
      setNonesx("none");
      setShow("block");
      setDescription(info.desc || "");
      setOwnerUid(info.owner.uid);
      setOwner(info.isOwner ? `${info.owner.name} ( You )` : info.owner.name);
      setCurrentTagHidden(!!info.hidden);
      loadFiles(name, !!info.hidden);
    } catch (error) {
      console.log("Error resolving tag:", error);
      setPending("none");
    }
  };

  const checkBase = () => {
    const cleanTag = (tagname || "").trim();
    if (!cleanTag) {
      return;
    }

    // Undocumented on purpose: typing #vault opens the hidden-tags vault.
    if (cleanTag.toLowerCase() === "#vault") {
      setTagName("");
      startVault();
      return;
    }

    setTagName(cleanTag);
    canonicalizeTagRoute(cleanTag);
    resolveTag(cleanTag);
  };

  const eCheckBase = (e) => {
    if (e.key === "Enter") {
      checkBase();
    }
  };

  const myClick = (name) => {
    setTagName(name);
    canonicalizeTagRoute(name);
    resolveTag(name);
    setIsTagSidebarOpen(false);
  };

  /* ---- hidden-tags vault ---- */

  const openVaultPanel = async () => {
    try {
      const { tags } = await api.vaultTags();
      setHiddenTags(tags);
      setVaultOpen(true);
    } catch (error) {
      if (error.status === 401) {
        api.setVaultToken(null);
        setVaultModal("unlock");
      } else {
        console.log("Vault error:", error);
      }
    }
  };

  const performHide = async (name) => {
    try {
      await api.hideTag(name);
      setMyTags((tags) =>
        tags.filter((t) => (typeof t === "string" ? t : t.name) !== name)
      );
      setFavoriteTags((tags) => tags.filter((t) => t !== name));
      if (tagname === name) {
        resetTagState();
        setPending("none");
        setLoadingFiles(false);
        setTagName("");
        navigate("/manage");
      }
    } catch (error) {
      alert(error.message);
    }
  };

  const runVaultAction = async (action) => {
    if (action?.type === "hide") {
      await performHide(action.name);
    } else if (action?.type === "open") {
      await resolveTag(action.name);
    } else {
      await openVaultPanel();
    }
  };

  // Entry point for the #vault trigger (action = null → panel), the per-tag
  // hide button, and unlock-to-view of a locked tag. Prompts for
  // setup/unlock first when needed.
  const startVault = async (action = null) => {
    setPendingAction(action);
    setVaultPassword("");
    setVaultPassword2("");
    setVaultError("");

    if (api.hasVaultToken()) {
      setPendingAction(null);
      await runVaultAction(action);
      return;
    }

    try {
      const { configured } = await api.vaultStatus();
      setVaultModal(configured ? "unlock" : "setup");
    } catch (error) {
      console.log("Vault status error:", error);
    }
  };

  const submitVault = async () => {
    if (vaultBusy) return;
    setVaultError("");

    if (vaultModal === "setup") {
      if (vaultPassword.length < 6) {
        setVaultError("Use at least 6 characters");
        return;
      }
      if (vaultPassword !== vaultPassword2) {
        setVaultError("Passwords don't match");
        return;
      }
    }

    setVaultBusy(true);
    try {
      const { vaultToken } =
        vaultModal === "setup"
          ? await api.vaultSetup(vaultPassword)
          : await api.vaultUnlock(vaultPassword);
      api.setVaultToken(vaultToken);
      setVaultModal(null);
      setVaultPassword("");
      setVaultPassword2("");

      const action = pendingAction;
      setPendingAction(null);
      await runVaultAction(action);
    } catch (error) {
      setVaultError(error.message);
    } finally {
      setVaultBusy(false);
    }
  };

  // Deliberately no route change: hidden tag names never enter the URL bar
  // or browser history.
  const openHiddenTag = (name) => {
    setVaultOpen(false);
    setTagName(name);
    resolveTag(name);
  };

  const unhideHiddenTag = async (name) => {
    try {
      await api.unhideTag(name);
      setHiddenTags((prev) => prev.filter((t) => t.name !== name));
      api
        .myTags()
        .then(({ tags }) => setMyTags(tags))
        .catch(() => {});
      if (tagname === name) {
        setCurrentTagHidden(false);
      }
    } catch (error) {
      alert(error.message);
    }
  };

  const toggleFavorite = async (name) => {
    const isFav = favoriteTags.includes(name);
    const nextFavs = isFav
      ? favoriteTags.filter((tag) => tag !== name)
      : [...favoriteTags, name];
    setFavoriteTags(nextFavs);

    try {
      await api.setFavorite(name, !isFav);
    } catch (error) {
      setFavoriteTags(favoriteTags);
      console.log("Favorite update error:", error);
    }
  };

  const openDeleteTagModal = (name) => {
    const tagItem =
      normalizedMyTagItems.find((item) => item.name === name) || { name };
    setDeleteTagCandidate(tagItem);
  };

  const closeDeleteTagModal = () => {
    if (!deletingTag) {
      setDeleteTagCandidate(null);
    }
  };

  const deleteTagAndFiles = async () => {
    if (!deleteTagCandidate?.name || deletingTag) {
      return;
    }

    const name = deleteTagCandidate.name;
    setDeletingTag(true);

    try {
      await api.deleteTag(name);

      setMyTags((tags) =>
        tags.filter((tag) => (typeof tag === "string" ? tag : tag.name) !== name)
      );
      setFavoriteTags((tags) => tags.filter((tag) => tag !== name));

      if (tagname === name) {
        resetTagState();
        setPending("none");
        setLoadingFiles(false);
        setTagName("");
        navigate("/manage");
      }

      setDeleteTagCandidate(null);
    } catch (error) {
      console.log("Tag delete error:", error);
    } finally {
      setDeletingTag(false);
    }
  };

  const requestAccess = async () => {
    try {
      await api.requestAccess(tagname);
      setReqModalSuccess(true);
    } catch (error) {
      if (error.status === 409) {
        setRequestModal(true);
      } else {
        console.log("Request access error:", error);
      }
    }
  };

  const handleClose = () => {
    setRequestModal(false);
    setReqModalSuccess(false);
  };

  const handleDelete = async (item) => {
    if (uid !== ownerUid) {
      return;
    }

    try {
      await api.deleteFile(tagname, item.name);
      setFiles((prev) => prev.filter((entry) => entry.fullPath !== item.fullPath));
    } catch (error) {
      console.log("Delete error:", error);
    }
  };

  const openRename = (item) => {
    setMenuOpenFor(null);
    const { base, ext } = splitFileName(item.name);
    setRenameCandidate(item);
    setRenameValue(base);
    setRenameExt(ext);
    setRenameError("");
  };

  const closeRename = () => {
    if (!renaming) {
      setRenameCandidate(null);
    }
  };

  const submitRename = async () => {
    if (!renameCandidate || renaming) {
      return;
    }
    const base = renameValue.trim();
    if (!base) {
      setRenameError("Name can't be empty");
      return;
    }
    if (/[\\/]/.test(base)) {
      setRenameError("Name can't contain slashes");
      return;
    }
    const nextName = base + renameExt;
    if (nextName === renameCandidate.name) {
      setRenameCandidate(null);
      return;
    }

    setRenaming(true);
    setRenameError("");
    try {
      const { file: updated } = await api.renameFile(
        tagname,
        renameCandidate.name,
        nextName
      );
      const patched = currentTagHidden
        ? {
            ...updated,
            url: api.withVaultParam(updated.url),
            thumbnailURL: updated.thumbnailURL ? api.withVaultParam(updated.thumbnailURL) : "",
          }
        : updated;
      setFiles((prev) =>
        prev.map((entry) =>
          entry.fullPath === renameCandidate.fullPath ? { ...entry, ...patched } : entry
        )
      );
      setRenameCandidate(null);
    } catch (error) {
      setRenameError(error.message);
    } finally {
      setRenaming(false);
    }
  };

  const sortedFiles = useMemo(() => {
    const copy = [...files];
    copy.sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.timeCreated).getTime() - new Date(b.timeCreated).getTime();
      }
      if (sortBy === "nameAsc") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "nameDesc") {
        return b.name.localeCompare(a.name);
      }
      if (sortBy === "sizeDesc") {
        return b.size - a.size;
      }
      if (sortBy === "sizeAsc") {
        return a.size - b.size;
      }
      return 0;
    });
    return copy;
  }, [files, sortBy]);

  // Images/videos in the current display order — what the fullscreen viewer
  // steps through. Non-media files open in a new tab instead.
  const viewableFiles = useMemo(
    () => sortedFiles.filter((item) => isViewableName(item.name)),
    [sortedFiles]
  );

  const openFile = (item) => {
    if (isViewableName(item.name)) {
      const idx = viewableFiles.findIndex((entry) => entry.fullPath === item.fullPath);
      if (idx !== -1) {
        setLightboxIndex(idx);
        return;
      }
    }
    window.open(item.url);
  };

  const normalizedMyTagItems = useMemo(() => {
    const unique = new Map();

    mytags.forEach((tag) => {
      const item =
        typeof tag === "string"
          ? { name: tag.trim() }
          : { ...tag, name: typeof tag?.name === "string" ? tag.name.trim() : "" };

      if (item.name && !unique.has(item.name)) {
        unique.set(item.name, item);
      }
    });

    const sorted = Array.from(unique.values());
    sorted.sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name);

      if (tagSortBy === "nameDesc") {
        return b.name.localeCompare(a.name);
      }

      if (tagSortBy === "dateDesc") {
        return getTagCreatedTime(b) - getTagCreatedTime(a) || nameCompare;
      }

      if (tagSortBy === "dateAsc") {
        return getTagCreatedTime(a) - getTagCreatedTime(b) || nameCompare;
      }

      if (tagSortBy === "activityDesc") {
        return getTagActivityTime(b) - getTagActivityTime(a) || nameCompare;
      }

      return nameCompare;
    });

    return sorted;
  }, [mytags, tagSortBy]);

  const normalizedMyTags = useMemo(
    () => normalizedMyTagItems.map((tag) => tag.name),
    [normalizedMyTagItems]
  );

  const favoriteSet = useMemo(() => new Set(favoriteTags), [favoriteTags]);

  const favoriteOwnedTags = useMemo(() => {
    const ownedSet = new Set(normalizedMyTags);
    const ordered = favoriteTags.filter((tag) => ownedSet.has(tag));
    const extras = normalizedMyTags.filter(
      (tag) => favoriteSet.has(tag) && !ordered.includes(tag)
    );
    return [...ordered, ...extras];
  }, [normalizedMyTags, favoriteSet, favoriteTags]);

  const topFavoriteTags = useMemo(() => favoriteOwnedTags.slice(0, 10), [favoriteOwnedTags]);

  const query = myTagQuery.trim().toLowerCase();
  const filteredAllTags = useMemo(
    () =>
      normalizedMyTags.filter((tag) =>
        query ? tag.toLowerCase().includes(query) : true
      ),
    [normalizedMyTags, query]
  );

  // Owner-only kebab menu (Rename / Delete) shared by tiles and list rows.
  const renderFileMenu = (item, variant) => {
    if (uid !== ownerUid) {
      return null;
    }
    const isOpen = menuOpenFor === item.fullPath;
    return (
      <div className={`file-menu-wrap ${variant}`} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="file-menu-btn"
          aria-label="File actions"
          aria-expanded={isOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpenFor(isOpen ? null : item.fullPath);
          }}
        >
          <MoreVertical size={15} />
        </button>
        {isOpen && (
          <>
            <div
              className="file-menu-backdrop"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenFor(null);
              }}
            />
            <div className="file-menu" role="menu">
              <button
                type="button"
                className="file-menu-item"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  openRename(item);
                }}
              >
                <Pencil size={14} />
                <span>Rename</span>
              </button>
              <button
                type="button"
                className="file-menu-item danger"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenFor(null);
                  handleDelete(item);
                }}
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="manage-tag-panel w-100" style={{ marginTop: "-12px" }}>
        <div className="manage-tag-head">
          <h3 className="manage-tag-title">Favorite Tags</h3>
          <span className="manage-tag-count">{Math.min(favoriteOwnedTags.length, 10)}/10</span>
        </div>

        {loading && (
          <div style={{ width: "100%", padding: "8px 0" }}>
            <Spinner
              animation="border"
              variant="success"
              style={{ height: "26px", width: "26px" }}
            />
          </div>
        )}

        {!loading && (
          <div className="manage-tag-strip" role="list" aria-label="Favorite tags">
            {topFavoriteTags.map((name) => (
              <div
                key={`fav-${name}`}
                className={`manage-tag-chip manage-tag-chip-compact ${tagname === name ? "tag-chip-active" : ""}`}
              >
                <button
                  type="button"
                  className="manage-tag-chip-main"
                  onClick={() => myClick(name)}
                  title={name}
                >
                  {name}
                </button>
                <button
                  type="button"
                  className="manage-tag-fav is-fav"
                  onClick={() => toggleFavorite(name)}
                  title="Unfavorite"
                >
                  <Star size={12} fill="currentColor" />
                </button>
              </div>
            ))}
            {!topFavoriteTags.length && (
              <div className="manage-tag-empty">No favorites yet. Star tags from the sidebar.</div>
            )}
          </div>
        )}
      </div>

      <div className="manage-main-layout">
        <div className="manage-main-column">
          <button
            type="button"
            className="manage-tag-sidebar-toggle"
            onClick={() => setIsTagSidebarOpen((open) => !open)}
            aria-expanded={isTagSidebarOpen}
            aria-controls="manage-all-tags-sidebar"
          >
            {isTagSidebarOpen ? "Hide all tags" : "Browse all tags"}
          </button>

          <div className="manage-main-card" style={{ marginTop: "1rem" }}>
            <FormLabel
              style={{
                color: "var(--muted)",
                fontWeight: "700",
                fontSize: "13px",
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                marginBottom: "0.4rem",
              }}
            >
              Tag Name
            </FormLabel>
            <InputGroup className="mb-3">
              <FormControl
                value={tagname}
                style={{
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  outline: "none",
                  fontWeight: "bold",
                  height: "40px",
                }}
                placeholder="Tag Name"
                aria-label="Tag Name"
                aria-describedby="basic-addon2"
                onChange={(e) => setTagName(e.target.value)}
                onKeyDown={eCheckBase}
              />
              <Button
                style={{ outline: "none", color: "var(--on-primary)", fontWeight: "bold" }}
                id="cusbtn"
                onClick={checkBase}
              >
                <b>Check</b>
              </Button>
            </InputGroup>
            <Spinner
              style={{ display: `${pending}` }}
              animation="border"
              variant="success"
              className="mx-auto my-3"
            />
            <Alert
              style={{
                display: `${nones}`,
                border: "none",
              }}
              variant="danger"
            >
              Oops! The tag doesn't exist
            </Alert>
            {mones !== "none" && (
              <div className="tag-details-modern">
                <div className="tag-details-item">
                  <div className="tag-details-label">Tag</div>
                  <div className="tag-details-value">
                    {tagname}
                    {currentTagHidden && (
                      <span className="vault-chip">
                        <Lock size={10} /> hidden
                      </span>
                    )}
                  </div>
                </div>
                <div className="tag-details-item">
                  <div className="tag-details-label">Owner</div>
                  <div className="tag-details-value">{owner}</div>
                </div>
                {description && (
                  <div className="tag-details-item">
                    <div className="tag-details-label">Description</div>
                    <div className="tag-details-value">{description}</div>
                  </div>
                )}
              </div>
            )}
            <Alert
              style={{
                display: `${nonesx}`,
              }}
              variant="danger"
            >
              You don't have permission
              <br />
              <Button
                size="sm"
                className="mt-3 mb-3"
                style={{
                  padding: 10,
                  borderRadius: 4,
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
                variant="danger"
                onClick={requestAccess}
              >
                Request Access
              </Button>
            </Alert>
          </div>

          <div
            style={{
              display: `${show}`,
            }}
            className="manage-main-files panel-shell"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <h3
                  style={{
                    display: `${empty}`,
                    fontWeight: "700",
                    fontSize: "15px",
                    margin: 0,
                    color: "var(--danger)",
                  }}
                >
                  No Files
                </h3>
                <h3
                  style={{
                    display: `${nempty}`,
                    color: "var(--text)",
                    fontWeight: "700",
                    fontSize: "15px",
                    margin: 0,
                  }}
                >
                  Files
                </h3>
                <span style={{ color: "var(--muted)", fontSize: "13px", fontWeight: "600" }}>{sortedFiles.length > 0 ? `${sortedFiles.length} item${sortedFiles.length !== 1 ? "s" : ""}` : ""}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Form.Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    fontWeight: "600",
                    fontSize: "13px",
                    width: "170px",
                    height: "34px",
                    padding: "0 0.5rem",
                  }}
                >
                  {Object.entries(SORT_OPTIONS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Form.Select>
                <Button
                  id="cusbtn"
                  size="sm"
                  onClick={() => setLayout((prev) => (prev === "tiles" ? "list" : "tiles"))}
                  style={{ color: "var(--on-primary)", fontWeight: "700", fontSize: "13px" }}
                >
                  {layout === "tiles" ? "List" : "Tiles"}
                </Button>
              </div>
            </div>

            {loadingFiles && (
              <div className="file-grid" aria-label="Loading files">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="file-tile-card file-tile-skeleton" aria-hidden="true">
                    <div className="file-tile-thumb">
                      <div className="skeleton-block skeleton-thumb" />
                    </div>
                    <div className="file-tile-body">
                      <div className="skeleton-block skeleton-line skeleton-line-lg" />
                      <div className="skeleton-block skeleton-line skeleton-line-md" />
                      <div className="skeleton-block skeleton-line skeleton-line-sm" />
                      <div className="skeleton-block skeleton-line skeleton-line-meta" style={{ marginTop: "auto" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loadingFiles && layout === "tiles" && (
              <div className="cardDeck file-grid">
                {sortedFiles.map((item) => (
                  <div
                    key={item.fullPath}
                    onClick={() => openFile(item)}
                    className="file-tile-card"
                  >
                    {/* actions menu — stop propagation so it doesn't trigger open */}
                    {renderFileMenu(item, "tile")}

                    {/* thumbnail */}
                    <div className="file-tile-thumb">
                      {isImageFile(item.name) ? (
                        <img
                          src={item.thumbnailURL || item.url}
                          alt=""
                          onError={(e) => {
                            if (e.currentTarget.src !== item.url) {
                              e.currentTarget.src = item.url;
                            }
                          }}
                          style={{
                            width: "44px",
                            height: "44px",
                            objectFit: "cover",
                            borderRadius: "8px",
                            opacity: 0.88,
                          }}
                        />
                      ) : (
                        <span className="file-type-icon" style={{ color: getFileIconColor(item.name) }}>{getFileIcon(item.name)}</span>
                      )}
                    </div>

                    {/* filename + meta — flex:1 so all cards same height */}
                    <div className="file-tile-body">
                      <div className="file-tile-name">{item.name}</div>
                      <div className="file-tile-meta">
                        <span>{getCorrectDate(item.timeCreated)}</span>
                        <span>{getSize(item.size)}</span>
                      </div>
                      <div className="file-tile-uploader">{item.uploadedBy}</div>
                    </div>

                    {/* subtle open hint */}
                    <div className="file-tile-hint">
                      <ExternalLink size={9} />
                      <span>tap to open</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loadingFiles && layout === "list" && (
              <div>
                {sortedFiles.map((item) => (
                  <div
                    key={item.fullPath}
                    onClick={() => openFile(item)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      padding: "7px 10px",
                      marginBottom: "4px",
                      backgroundColor: "var(--surface-2)",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      cursor: "pointer",
                      transition: "border-color 0.12s",
                    }}
                    className="file-list-row"
                  >
                    <div style={{ display: "flex", alignItems: "center", minWidth: 0, gap: "8px", flex: 1 }}>
                      {isImageFile(item.name) ? (
                        <img
                          src={item.thumbnailURL || item.url}
                          alt="preview"
                          onError={(e) => {
                            if (e.currentTarget.src !== item.url) {
                              e.currentTarget.src = item.url;
                            }
                          }}
                          style={{
                            width: "28px",
                            height: "28px",
                            flexShrink: 0,
                            objectFit: "cover",
                            borderRadius: "4px",
                            opacity: 0.85,
                          }}
                        />
                      ) : (
                        <span className="file-type-icon file-type-icon-sm" style={{ color: getFileIconColor(item.name) }}>{getFileIcon(item.name)}</span>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: "600", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.name}
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: "11px", marginTop: "1px", display: "flex", alignItems: "center", gap: "4px" }}>
                          {item.uploadedBy} · {getCorrectDate(item.timeCreated)} · {getSize(item.size)}
                        </div>
                      </div>
                    </div>
                    {renderFileMenu(item, "list")}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside
          id="manage-all-tags-sidebar"
          className={`manage-tag-sidebar ${isTagSidebarOpen ? "is-open" : ""}`}
          aria-label="All tags"
        >
          <div className="manage-tag-head">
            <h3 className="manage-tag-title">All Tags</h3>
            <span className="manage-tag-count">{normalizedMyTags.length}</span>
          </div>

          <div className="manage-tag-search-wrap manage-tag-controls">
            <FormControl
              value={myTagQuery}
              onChange={(e) => setMyTagQuery(e.target.value)}
              placeholder="Search tags"
              className="manage-tag-search"
            />
            <Form.Select
              value={tagSortBy}
              onChange={(e) => setTagSortBy(e.target.value)}
              className="manage-tag-sort"
              aria-label="Sort tags"
            >
              {Object.entries(TAG_SORT_OPTIONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Form.Select>
          </div>

          <div className="manage-tag-list">
            {!loading && filteredAllTags.map((name) => (
              <div
                key={`all-${name}`}
                className={`manage-tag-list-item ${tagname === name ? "tag-chip-active" : ""}`}
              >
                <button
                  type="button"
                  className="manage-tag-list-main"
                  onClick={() => myClick(name)}
                  title={name}
                >
                  {name}
                </button>
                <button
                  type="button"
                  className={`manage-tag-fav ${favoriteSet.has(name) ? "is-fav" : ""}`}
                  onClick={() => toggleFavorite(name)}
                  title={favoriteSet.has(name) ? "Unfavorite" : "Favorite"}
                >
                  <Star size={12} fill={favoriteSet.has(name) ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  className="manage-tag-delete"
                  onClick={() => startVault({ type: "hide", name })}
                  title="Hide tag"
                  aria-label={`Hide ${name}`}
                  style={{ color: "var(--muted)" }}
                >
                  <EyeOff size={12} />
                </button>
                <button
                  type="button"
                  className="manage-tag-delete"
                  onClick={() => openDeleteTagModal(name)}
                  title="Delete tag"
                  aria-label={`Delete ${name}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {!loading && !filteredAllTags.length && (
              <div className="manage-tag-empty">No matching tags</div>
            )}
          </div>
        </aside>
      </div>

        <Modal
          show={requestModal}
          onHide={handleClose}
          size="sm"
          aria-labelledby="contained-modal-title-vcenter"
          centered
          transition={Fade}
          backdropTransition={Fade}
        >
          <Modal.Header
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--danger)",
              border: "none",
            }}
          >
            <Modal.Title>
              <b>Request Already Sent</b>
            </Modal.Title>
          </Modal.Header>

          <Modal.Body style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}>
            Please wait till the owner approves your request.
          </Modal.Body>

          <Modal.Footer style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}>
            <Button
              id="cusbtn"
              variant="secondary"
              onClick={handleClose}
              style={{ fontWeight: "bold" }}
            >
              Close
            </Button>
          </Modal.Footer>
        </Modal>

        <Modal
          show={reqModalSuccess}
          onHide={handleClose}
          size="sm"
          aria-labelledby="contained-modal-title-vcenter"
          centered
          transition={Fade}
          backdropTransition={Fade}
        >
          <Modal.Header
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--ok)",
              border: "none",
            }}
          >
            <Modal.Title>
              <b>Request Sent</b>
            </Modal.Title>
          </Modal.Header>

          <Modal.Body style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}>
            Please wait till the owner approves your request.
          </Modal.Body>

          <Modal.Footer style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}>
            <Button
              id="cusbtn"
              variant="secondary"
              onClick={handleClose}
              style={{ fontWeight: "bold" }}
            >
              Close
            </Button>
          </Modal.Footer>
        </Modal>

        <Modal
          show={Boolean(deleteTagCandidate)}
          onHide={closeDeleteTagModal}
          size="sm"
          aria-labelledby="delete-tag-modal-title"
          centered
          transition={Fade}
          backdropTransition={Fade}
        >
          <Modal.Header
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--danger)",
              border: "none",
            }}
          >
            <Modal.Title id="delete-tag-modal-title">
              <b>Delete Tag?</b>
            </Modal.Title>
          </Modal.Header>

          <Modal.Body
            style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}
          >
            <div className="tag-delete-warning">
              This will permanently delete <b>{deleteTagCandidate?.name}</b> and every file inside it.
            </div>
          </Modal.Body>

          <Modal.Footer
            style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}
          >
            <Button
              variant="secondary"
              onClick={closeDeleteTagModal}
              disabled={deletingTag}
              style={{ fontWeight: "bold" }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={deleteTagAndFiles}
              disabled={deletingTag}
              style={{ fontWeight: "bold" }}
            >
              {deletingTag ? "Deleting..." : "Delete Everything"}
            </Button>
          </Modal.Footer>
        </Modal>

        <Modal
          show={Boolean(renameCandidate)}
          onHide={closeRename}
          size="sm"
          aria-labelledby="rename-file-modal-title"
          centered
          transition={Fade}
          backdropTransition={Fade}
        >
          <Modal.Header
            style={{ backgroundColor: "var(--surface)", color: "var(--primary)", border: "none" }}
          >
            <Modal.Title id="rename-file-modal-title">
              <b>Rename file</b>
            </Modal.Title>
          </Modal.Header>

          <Modal.Body style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}>
            <div className="rename-field">
              <FormControl
                autoFocus
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value);
                  if (renameError) setRenameError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename();
                }}
                placeholder="File name"
                aria-label="New file name"
                disabled={renaming}
                style={{
                  backgroundColor: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  fontWeight: "600",
                  height: "44px",
                  fontSize: "16px",
                }}
              />
              {renameExt && <span className="rename-ext">{renameExt}</span>}
            </div>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
              The extension <code>{renameExt || "(none)"}</code> stays the same.
            </p>
            {renameError && (
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "var(--danger)", fontWeight: 600 }}>
                {renameError}
              </p>
            )}
          </Modal.Body>

          <Modal.Footer style={{ backgroundColor: "var(--surface)", border: "none" }}>
            <Button
              variant="secondary"
              onClick={closeRename}
              disabled={renaming}
              style={{ fontWeight: "bold" }}
            >
              Cancel
            </Button>
            <Button
              id="cusbtn"
              onClick={submitRename}
              disabled={renaming}
              style={{ color: "var(--on-primary)", fontWeight: "bold" }}
            >
              {renaming ? "Renaming..." : "Rename"}
            </Button>
          </Modal.Footer>
        </Modal>

        <Modal
          show={Boolean(vaultModal)}
          onHide={() => !vaultBusy && setVaultModal(null)}
          size="sm"
          centered
          transition={Fade}
          backdropTransition={Fade}
        >
          <Modal.Header
            style={{ backgroundColor: "var(--surface)", color: "var(--primary)", border: "none" }}
          >
            <Modal.Title>
              <b style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
                <Lock size={16} />
                {vaultModal === "setup" ? "Create vault password" : "Unlock vault"}
              </b>
            </Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}>
            {vaultModal === "setup" && (
              <p style={{ marginTop: 0, fontSize: "0.82rem", color: "var(--muted)" }}>
                This password protects your hidden tags. It cannot be recovered
                if forgotten — hidden tags would need manual recovery on the
                server.
              </p>
            )}
            <FormControl
              autoFocus
              type="password"
              value={vaultPassword}
              onChange={(e) => {
                setVaultPassword(e.target.value);
                if (vaultError) setVaultError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && vaultModal !== "setup") submitVault();
              }}
              placeholder="Vault password"
              aria-label="Vault password"
              disabled={vaultBusy}
              style={{
                backgroundColor: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontWeight: "600",
                height: "44px",
                fontSize: "16px",
              }}
            />
            {vaultModal === "setup" && (
              <FormControl
                type="password"
                value={vaultPassword2}
                onChange={(e) => {
                  setVaultPassword2(e.target.value);
                  if (vaultError) setVaultError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitVault();
                }}
                placeholder="Repeat password"
                aria-label="Repeat vault password"
                disabled={vaultBusy}
                style={{
                  marginTop: "0.6rem",
                  backgroundColor: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  fontWeight: "600",
                  height: "44px",
                  fontSize: "16px",
                }}
              />
            )}
            {vaultError && (
              <p style={{ margin: "0.6rem 0 0", fontSize: "0.82rem", color: "var(--danger)", fontWeight: 600 }}>
                {vaultError}
              </p>
            )}
          </Modal.Body>
          <Modal.Footer style={{ backgroundColor: "var(--surface)", border: "none" }}>
            <Button
              variant="secondary"
              onClick={() => setVaultModal(null)}
              disabled={vaultBusy}
              style={{ fontWeight: "bold" }}
            >
              Cancel
            </Button>
            <Button
              id="cusbtn"
              onClick={submitVault}
              disabled={vaultBusy}
              style={{ color: "var(--on-primary)", fontWeight: "bold" }}
            >
              {vaultBusy ? "Working..." : vaultModal === "setup" ? "Create & Unlock" : "Unlock"}
            </Button>
          </Modal.Footer>
        </Modal>

        <Modal
          show={vaultOpen}
          onHide={() => setVaultOpen(false)}
          size="md"
          centered
          transition={Fade}
          backdropTransition={Fade}
        >
          <Modal.Header
            style={{ backgroundColor: "var(--surface)", color: "var(--primary)", border: "none" }}
          >
            <Modal.Title>
              <b style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
                <EyeOff size={16} /> Hidden tags
              </b>
            </Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}>
            {hiddenTags.length === 0 && (
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>
                No hidden tags. Use the <EyeOff size={12} style={{ verticalAlign: "-2px" }} /> icon
                next to a tag in the sidebar to hide it.
              </p>
            )}
            {hiddenTags.map((t) => (
              <div key={t.name} className="vault-row">
                <div className="vault-row-meta">
                  <span className="vault-row-name">{t.name}</span>
                  <span className="vault-row-sub">
                    {t.fileCount} file{t.fileCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <button type="button" className="vault-row-btn" onClick={() => openHiddenTag(t.name)}>
                  Open
                </button>
                <button
                  type="button"
                  className="vault-row-btn vault-row-unhide"
                  onClick={() => unhideHiddenTag(t.name)}
                  title="Make this tag visible again"
                >
                  <Eye size={12} /> Unhide
                </button>
              </div>
            ))}
            <p style={{ margin: "0.9rem 0 0", color: "var(--muted)", fontSize: "0.74rem" }}>
              Vault locks automatically after 15 minutes or when you close the tab.
            </p>
          </Modal.Body>
        </Modal>

        {lightboxIndex !== null && viewableFiles[lightboxIndex] && (
          <Lightbox
            items={viewableFiles}
            index={lightboxIndex}
            onNavigate={setLightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </div>
  );
};

export default Manage;
