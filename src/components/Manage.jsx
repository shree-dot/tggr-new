import React, { useMemo, useState } from "react";
import app from "../base";
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
import firebase from "firebase/compat/app";
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

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
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
  const [userDocId, setUserDocId] = useState("");
  const [notis, setNotis] = useState([]);
  const [reqTags, setReqTags] = useState([]);
  const [names, setNames] = useState([]);
  const [user, setUser] = useState("");
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
  const loadFilesRequestIdRef = React.useRef(0);

  React.useEffect(() => {
    const currentUid = app.auth().currentUser.uid;
    setUID(currentUid);

    const db = app.firestore();
    db.collection("users")
      .where("uid", "==", currentUid)
      .get()
      .then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          setUserDocId(doc.id);
          setUser(doc.data().name);
          setFavoriteTags(doc.data().favoriteTags || []);
        });
      });

    db.collection("tags")
      .where("owner", "==", currentUid)
      .get()
      .then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          setMyTags((tags) => [
            ...tags,
            {
              id: doc.id,
              name: data.name,
              date: data.date,
              createdAt: data.createdAt,
              lastActivityAt: data.lastActivityAt,
              updatedAt: data.updatedAt,
            },
          ]);
        });
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

  const loadFiles = (tag) => {
    const requestId = ++loadFilesRequestIdRef.current;
    setFiles([]);
    setLoadingFiles(true);
    const db = app.firestore();

    app
      .storage()
      .ref(`${tag}`)
      .listAll()
      .then(async (result) => {
        if (requestId !== loadFilesRequestIdRef.current) {
          return;
        }

        if (!result.items.length) {
          setEmpty("block");
          setnEmpty("none");
          setLoadingFiles(false);
          return;
        }

        setnEmpty("block");

        let fileMetaMap = new Map();
        try {
          const tagDocs = await db
            .collection("tags")
            .where("name", "==", tag)
            .limit(1)
            .get();

          if (!tagDocs.empty) {
            const tagId = tagDocs.docs[0].id;
            const fileMetaSnapshot = await db
              .collection("tags")
              .doc(tagId)
              .collection("files")
              .get();

            fileMetaMap = new Map(
              fileMetaSnapshot.docs.map((doc) => [doc.id, doc.data()])
            );
          }
        } catch (err) {
          console.log("Error fetching file metadata map:", err);
        }

        const chunkSize = 12;
        let hasRenderedFirstChunk = false;

        for (let start = 0; start < result.items.length; start += chunkSize) {
          if (requestId !== loadFilesRequestIdRef.current) {
            return;
          }

          const chunk = result.items.slice(start, start + chunkSize);
          const batchItems = await Promise.all(
            chunk.map(async (itemRef) => {
              const [downloadURL, metadata] = await Promise.all([
                app.storage().ref(itemRef.fullPath).getDownloadURL(),
                app.storage().ref(itemRef.fullPath).getMetadata(),
              ]);

              const fileMeta = fileMetaMap.get(itemRef.name) || {};

              return {
                name: itemRef.name,
                fullPath: itemRef.fullPath,
                url: downloadURL,
                thumbnailURL: fileMeta.thumbnailURL || "",
                timeCreated: metadata.timeCreated,
                size: metadata.size,
                uploadedBy: fileMeta.uploadedBy || "Unknown",
              };
            })
          );

          if (requestId !== loadFilesRequestIdRef.current) {
            return;
          }

          setFiles((prev) => [...prev, ...batchItems]);

          if (!hasRenderedFirstChunk) {
            hasRenderedFirstChunk = true;
            setLoadingFiles(false);
          }
        }

        if (!hasRenderedFirstChunk) {
          setLoadingFiles(false);
        }
      })
      .catch(() => {
        if (requestId === loadFilesRequestIdRef.current) {
          setLoadingFiles(false);
        }
      });
  };

  const getOwner = (name) => {
    const db = app.firestore();
    db.collection("tags")
      .where("name", "==", name)
      .get()
      .then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          setDescription(data.desc || "");
          setOwnerUid(data.owner || "");

          db.collection("users")
            .where("uid", "==", data.owner)
            .get()
            .then((usersSnapshot) => {
              usersSnapshot.forEach((userDoc) => {
                if (uid === userDoc.data().uid) {
                  setOwner(`${userDoc.data().name} ( You )`);
                } else {
                  setOwner(userDoc.data().name);
                }
              });
            });
        });
      });
  };

  const resolveTag = (name) => {
    if (!name) {
      return;
    }

    resetTagState();

    app
      .firestore()
      .collection("tags")
      .where("name", "==", name)
      .get()
      .then((querySnapshot) => {
        setPending("none");

        if (querySnapshot.empty) {
          setNones("block");
          setNonesx("none");
          setMones("none");
          setShow("none");
          return;
        }

        let denied = false;
        querySnapshot.forEach((doc) => {
          if (doc.data().access === "2" && !doc.data().users.includes(uid)) {
            denied = true;
            setNames(doc.data().reqNames || []);
            setNotis(doc.data().requests || []);
            setReqTags(doc.data().reqTags || []);
          }
        });

        if (denied) {
          setNonesx("block");
          setMones("none");
          setShow("none");
          return;
        }

        setMones("block");
        setNones("none");
        setNonesx("none");
        setShow("block");
        getOwner(name);
        loadFiles(name);
      })
      .catch(() => {
        setPending("none");
      });
  };

  const checkBase = () => {
    const cleanTag = (tagname || "").trim();
    if (!cleanTag) {
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

  const toggleFavorite = async (name) => {
    if (!userDocId) {
      return;
    }

    const isFav = favoriteTags.includes(name);
    const nextFavs = isFav
      ? favoriteTags.filter((tag) => tag !== name)
      : [...favoriteTags, name];
    setFavoriteTags(nextFavs);

    try {
      await app
        .firestore()
        .collection("users")
        .doc(userDocId)
        .update({
          favoriteTags: isFav
            ? firebase.firestore.FieldValue.arrayRemove(name)
            : firebase.firestore.FieldValue.arrayUnion(name),
        });
    } catch (error) {
      setFavoriteTags(favoriteTags);
      console.log("Favorite update error:", error);
    }
  };

  const deleteStorageFolder = async (folderRef) => {
    const result = await folderRef.listAll();
    await Promise.all(result.items.map((itemRef) => itemRef.delete()));
    await Promise.all(result.prefixes.map((prefixRef) => deleteStorageFolder(prefixRef)));
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
      const db = app.firestore();
      const tagSnapshot = deleteTagCandidate.id
        ? await db.collection("tags").doc(deleteTagCandidate.id).get()
        : null;

      let tagDoc = tagSnapshot?.exists ? tagSnapshot : null;

      if (!tagDoc) {
        const lookup = await db
          .collection("tags")
          .where("name", "==", name)
          .where("owner", "==", uid)
          .limit(1)
          .get();

        if (!lookup.empty) {
          tagDoc = lookup.docs[0];
        }
      }

      await deleteStorageFolder(app.storage().ref(name));

      if (tagDoc) {
        const filesSnapshot = await tagDoc.ref.collection("files").get();
        const batch = db.batch();
        filesSnapshot.forEach((fileDoc) => batch.delete(fileDoc.ref));
        batch.delete(tagDoc.ref);
        await batch.commit();
      }

      if (userDocId) {
        await db
          .collection("users")
          .doc(userDocId)
          .update({
            favoriteTags: firebase.firestore.FieldValue.arrayRemove(name),
          });
      }

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

  const requestAccess = () => {
    const db = app.firestore();
    db.collection("tags")
      .where("name", "==", tagname)
      .get()
      .then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          if (doc.data().requests.includes(uid)) {
            setRequestModal(true);
          } else {
            db.collection("tags")
              .doc(doc.id)
              .update({
                requests: firebase.firestore.FieldValue.arrayUnion(uid),
                reqTags: firebase.firestore.FieldValue.arrayUnion(tagname),
                reqNames: firebase.firestore.FieldValue.arrayUnion(
                  `${user} is requesting access for ${tagname}`
                ),
              })
              .then(() => {
                setReqModalSuccess(true);
              });
          }
        });
      });
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
      await app.storage().ref(item.fullPath).delete();
      setFiles((prev) => prev.filter((entry) => entry.fullPath !== item.fullPath));
    } catch (error) {
      console.log("Delete error:", error);
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
                  <div className="tag-details-value">{tagname}</div>
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
                    onClick={() => window.open(item.url)}
                    className="file-tile-card"
                  >
                    {/* delete icon — stop propagation so it doesn't trigger open */}
                    {uid === ownerUid && (
                      <button
                        className="file-tile-delete"
                        onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}

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
                    onClick={() => window.open(item.url)}
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
                    {uid === ownerUid && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                        title="Delete"
                        style={{
                          flexShrink: 0,
                          background: "rgba(200,85,102,0.13)",
                          border: "1px solid rgba(200,85,102,0.28)",
                          borderRadius: "6px",
                          width: "26px",
                          height: "26px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                          color: "var(--danger)",
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
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
      </div>
  );
};

export default Manage;
