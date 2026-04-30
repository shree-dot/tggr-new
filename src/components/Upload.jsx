import React, { useMemo, useState, useRef } from "react";
import app from "../base";
import {
  Star,
  File,
  FileText,
  FileCode2,
  FileArchive,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  UploadCloud,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ProgressBar,
  Button,
  InputGroup,
  FormControl,
  FormLabel,
  Alert,
  Modal,
  Spinner,
  Fade,
} from "./ui/compat";
import "../util.css";
import firebase from "firebase/compat/app";

const Upload = () => {
  const navigate = useNavigate();
  const { tag: routeTag } = useParams();

  const decodedRouteTag = useMemo(
    () => (routeTag ? decodeURIComponent(routeTag) : ""),
    [routeTag]
  );

  const [tagname, setTagName] = useState("");
  const [uploadedItems, setUploadedItems] = useState([]);
  const [showx, setShow] = useState("none");
  const [nones, setNones] = useState("none");
  const [nonesx, setNonesx] = useState("none");
  const [mones, setMones] = useState("none");
  const [shows, setShows] = useState(false);
  const [reqModal, setRequestModal] = useState(false);
  const [reqModalSuccess, setReqModalSuccess] = useState(false);
  const [pending, setPending] = useState("none");
  const [owner, setOwner] = useState("");
  const [description, setDescription] = React.useState();
  const [user, setUser] = useState("");
  const [uid, setUID] = useState("");
  const [notis, setNotis] = useState([]);
  const [reqTags, setReqTags] = useState([]);
  const [shows1, setShows1] = useState(false);
  const [names, setNames] = useState([]);
  const [userDocId, setUserDocId] = useState("");
  const [favoriteTags, setFavoriteTags] = useState([]);
  const [myTagQuery, setMyTagQuery] = useState("");
  const [isTagSidebarOpen, setIsTagSidebarOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  React.useEffect(() => {
    const uid = app.auth().currentUser.uid;
    const db = app.firestore();
    db.collection("users")
      .where("uid", "==", uid)
      .get()
      .then(function (querySnapshot) {
        querySnapshot.forEach(function (doc) {
          setUser(doc.data().name);
          setUID(doc.data().uid);
          setUserDocId(doc.id);
          setFavoriteTags(doc.data().favoriteTags || []);
        });
      });
    db.collection("tags")
      .where("owner", "==", uid)
      .get()
      .then(function (querySnapshot) {
        querySnapshot.forEach(function (doc) {
          setMyTags((mytags) => [...mytags, doc.data().name]);
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

  const [mytags, setMyTags] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleClose = () => {
    setShows(false);
    setShows1(false);
    setRequestModal(false);
    setReqModalSuccess(false);
  };
  const handleShow = () => setShows(true);

  const handleChange = (e) => {
    setTagName(e.target.value);
  };

  const canonicalizeTagRoute = (tag) => {
    if (!tag) {
      return;
    }
    navigate(`/upload/${encodeURIComponent(tag)}`);
  };

  const finaliseStuff = () => {
    const hasUploaded = uploadedItems.some((item) => item.status === "done");
    if (hasUploaded) {
      handleShow();
    } else {
      setShows1(true);
    }
  };

  const resetTagState = () => {
    setNones("none");
    setMones("none");
    setNonesx("none");
    setShow("none");
    setPending("block");
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
      .then(function (querySnapshot) {
        setPending("none");
        if (!querySnapshot.empty) {
          app
            .firestore()
            .collection("tags")
            .where("name", "==", name)
            .get()
            .then(function (querySnapshot) {
              querySnapshot.forEach(function (doc) {
                if (doc.data().access === "2") {
                  if (doc.data().users.includes(uid)) {
                    setMones("block");
                    setNones("none");
                    setNonesx("none");
                    setShow("block");
                    getOwner(name);
                  } else {
                    const db = app.firestore();
                    db.collection("tags")
                      .where("name", "==", name)
                      .get()
                      .then(function (querySnapshot) {
                        querySnapshot.forEach(function (doc) {
                          setNames(doc.data().reqNames);
                          setNotis(doc.data().requests);
                          setReqTags(doc.data().reqTags);
                        });
                      });
                    setNonesx("block");
                    setMones("none");
                    setShow("none");
                  }
                }
              });
            });
          setMones("block");
          setNones("none");
          setNonesx("none");
          setShow("block");
        } else {
          setNones("block");
          setNonesx("none");
          setMones("none");
          setShow("none");
        }
      })
      .catch(function (error) {
        console.log("Error getting documents: ", error);
      });
    getOwner(name);
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

  const normalizedMyTags = useMemo(() => {
    const safeTags = mytags
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter(Boolean);
    const unique = Array.from(new Set(safeTags));
    return unique.sort((a, b) => a.localeCompare(b));
  }, [mytags]);

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

  const checkBase = () => {
    const cleanTag = (tagname || "").trim();
    if (!cleanTag) {
      return;
    }
    setTagName(cleanTag);
    canonicalizeTagRoute(cleanTag);
    resolveTag(cleanTag);
  };

  const getOwner = async (name) => {
    const db = app.firestore();
    await db
      .collection("tags")
      .where("name", "==", name)
      .get()
      .then(function (querySnapshot) {
        querySnapshot.forEach(function (doc) {
          setDescription(doc.data().desc);
          db.collection("users")
            .where("uid", "==", doc.data().owner)
            .get()
            .then(function (querySnapshot) {
              querySnapshot.forEach(function (doc) {
                if (uid === doc.data().uid) {
                  setOwner(doc.data().name + " ( You )");
                } else setOwner(doc.data().name);
              });
            });
        });
      });
  };

  const eCheckBase = (e) => {
    if (e.key === "Enter") {
      checkBase();
    }
  };

  const isImageFile = (file) => {
    if (!file) {
      return false;
    }

    const type = (file.type || "").toLowerCase();
    if (type.startsWith("image/")) {
      return true;
    }

    const lower = (file.name || "").toLowerCase();
    return (
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".webp") ||
      lower.endsWith(".bmp") ||
      lower.endsWith(".gif") ||
      lower.endsWith(".svg")
    );
  };

  const createThumbnailBlob = (file, maxSize = 180, quality = 0.72) =>
    new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Canvas context is not available"));
          return;
        }

        ctx.drawImage(image, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error("Thumbnail blob generation failed"));
              return;
            }
            resolve(blob);
          },
          "image/webp",
          quality
        );
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to read image for thumbnail"));
      };

      image.src = objectUrl;
    });

  const isImageFilename = (filename = "") => {
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
      pdf: { icon: <FileText size={22} />, color: "#ff7f92" },
      doc: { icon: <FileText size={22} />, color: "#a8d5ff" },
      docx: { icon: <FileText size={22} />, color: "#a8d5ff" },
      txt: { icon: <FileText size={22} />, color: "#c0c0c0" },
      rtf: { icon: <FileText size={22} />, color: "#a8d5ff" },
      md: { icon: <FileText size={22} />, color: "#f59e0b" },
      js: { icon: <FileCode2 size={22} />, color: "#fbbf24" },
      jsx: { icon: <FileCode2 size={22} />, color: "#fbbf24" },
      ts: { icon: <FileCode2 size={22} />, color: "#60a5fa" },
      tsx: { icon: <FileCode2 size={22} />, color: "#60a5fa" },
      json: { icon: <FileCode2 size={22} />, color: "#fbbf24" },
      html: { icon: <FileCode2 size={22} />, color: "#f97316" },
      css: { icon: <FileCode2 size={22} />, color: "#60a5fa" },
      py: { icon: <FileCode2 size={22} />, color: "#3b82f6" },
      java: { icon: <FileCode2 size={22} />, color: "#ef4444" },
      c: { icon: <FileCode2 size={22} />, color: "#8b5cf6" },
      cpp: { icon: <FileCode2 size={22} />, color: "#8b5cf6" },
      csv: { icon: <FileSpreadsheet size={22} />, color: "#10b981" },
      xls: { icon: <FileSpreadsheet size={22} />, color: "#10b981" },
      xlsx: { icon: <FileSpreadsheet size={22} />, color: "#10b981" },
      zip: { icon: <FileArchive size={22} />, color: "#f7d463" },
      rar: { icon: <FileArchive size={22} />, color: "#f7d463" },
      "7z": { icon: <FileArchive size={22} />, color: "#f7d463" },
      tar: { icon: <FileArchive size={22} />, color: "#f7d463" },
      gz: { icon: <FileArchive size={22} />, color: "#f7d463" },
      mp4: { icon: <FileVideo size={22} />, color: "#ec4899" },
      mov: { icon: <FileVideo size={22} />, color: "#ec4899" },
      mkv: { icon: <FileVideo size={22} />, color: "#ec4899" },
      avi: { icon: <FileVideo size={22} />, color: "#ec4899" },
      webm: { icon: <FileVideo size={22} />, color: "#ec4899" },
      mp3: { icon: <FileAudio size={22} />, color: "#8b5cf6" },
      wav: { icon: <FileAudio size={22} />, color: "#8b5cf6" },
      aac: { icon: <FileAudio size={22} />, color: "#8b5cf6" },
      m4a: { icon: <FileAudio size={22} />, color: "#8b5cf6" },
      flac: { icon: <FileAudio size={22} />, color: "#8b5cf6" },
      ogg: { icon: <FileAudio size={22} />, color: "#8b5cf6" },
    };

    return iconMap[ext] || { icon: <File size={22} />, color: "#9daeba" };
  };

  const bytesToMB = (bytes = 0) => bytes / (1024 * 1024);

  const formatMB = (bytes = 0) => {
    const mb = bytesToMB(bytes);
    if (mb >= 100) {
      return `${mb.toFixed(0)} MB`;
    }
    if (mb >= 10) {
      return `${mb.toFixed(1)} MB`;
    }
    return `${mb.toFixed(2)} MB`;
  };

  const formatSpeed = (mbPerSec = 0) => `${mbPerSec.toFixed(mbPerSec >= 10 ? 1 : 2)} MB/s`;

  const queueThumbnailGeneration = ({ selectedFile, filename, tagId, itemId }) => {
    if (!isImageFile(selectedFile) || !tagId) {
      return;
    }

    // Run thumbnail generation lazily so main upload flow remains fast.
    (async () => {
      try {
        const thumbnailBlob = await createThumbnailBlob(selectedFile);
        const thumbnailPath = `${tagname}/.thumbs/${filename}.webp`;
        const thumbnailRef = app.storage().ref(thumbnailPath);
        await thumbnailRef.put(thumbnailBlob, { contentType: "image/webp" });
        const thumbnailURL = await thumbnailRef.getDownloadURL();

        await app
          .firestore()
          .collection("tags")
          .doc(tagId)
          .collection("files")
          .doc(filename)
          .set(
            {
              thumbnailPath,
              thumbnailURL,
            },
            { merge: true }
          );

        setUploadedItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  thumbnailURL,
                }
              : item
          )
        );
      } catch (thumbnailError) {
        console.log("Background thumbnail generation skipped:", thumbnailError);
      }
    })();
  };

  const processSelectedFiles = async (selectedFiles) => {
    if (!selectedFiles.length || !tagname) {
      return;
    }

    const pendingItems = selectedFiles.map((selectedFile, index) => ({
      id: `${Date.now()}-${index}-${selectedFile.name}`,
      name: selectedFile.name,
      url: "",
      thumbnailURL: "",
      progress: 0,
      status: "uploading",
      isImage: isImageFile(selectedFile),
      file: selectedFile,
      totalBytes: selectedFile.size || 0,
      transferredBytes: 0,
      speedMbps: 0,
      lastSampleBytes: 0,
      lastSampleTime: Date.now(),
    }));
    setUploadedItems((prev) => [...pendingItems, ...prev]);

    const db = app.firestore();

    let resolvedTagId = "";
    try {
      const tagSnapshot = await db
        .collection("tags")
        .where("name", "==", tagname)
        .limit(1)
        .get();
      if (!tagSnapshot.empty) {
        resolvedTagId = tagSnapshot.docs[0].id;
      }
    } catch (tagLookupError) {
      console.log("Tag lookup error:", tagLookupError);
    }

    const uploadSingleFile = async (selectedFile, itemId, tagId) => {
      const filename = selectedFile.name;
      const storageRef = app.storage().ref(`${tagname}`).child(filename);
      const uploadTask = storageRef.put(selectedFile);

      await new Promise((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const fileProgress =
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            const roundedProgress = Math.round(fileProgress);
            setUploadedItems((prev) =>
              prev.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      progress: roundedProgress,
                      transferredBytes: snapshot.bytesTransferred,
                      totalBytes: snapshot.totalBytes,
                      speedMbps:
                        snapshot.bytesTransferred > (item.lastSampleBytes || 0)
                          ? (snapshot.bytesTransferred - (item.lastSampleBytes || 0)) /
                            (1024 * 1024) /
                            Math.max((Date.now() - (item.lastSampleTime || Date.now())) / 1000, 0.15)
                          : item.speedMbps || 0,
                      lastSampleBytes: snapshot.bytesTransferred,
                      lastSampleTime: Date.now(),
                    }
                  : item
              )
            );
          },
          (error) => {
            console.log(error);
            setUploadedItems((prev) =>
              prev.map((item) =>
                item.id === itemId ? { ...item, status: "error" } : item
              )
            );
            reject(error);
          },
          async () => {
            const downloadURL = await storageRef.getDownloadURL();

            // Store core metadata quickly, then generate thumbnails in background.
            try {
              if (tagId) {
                await db
                  .collection("tags")
                  .doc(tagId)
                  .collection("files")
                  .doc(filename)
                  .set({
                    uploadedBy: user,
                    uploadedByUid: uid,
                    uploadedAt: new Date(),
                  });

                queueThumbnailGeneration({
                  selectedFile,
                  filename,
                  tagId,
                  itemId,
                });
              }

              setUploadedItems((prev) =>
                prev.map((item) =>
                  item.id === itemId
                    ? {
                        ...item,
                        url: downloadURL,
                        progress: 100,
                        status: "done",
                        transferredBytes: item.totalBytes || item.transferredBytes,
                        speedMbps: 0,
                      }
                    : item
                )
              );
            } catch (err) {
              console.log("Error storing file metadata:", err);
              setUploadedItems((prev) =>
                prev.map((item) =>
                  item.id === itemId
                    ? {
                        ...item,
                        url: downloadURL,
                        progress: 100,
                        status: "done",
                        transferredBytes: item.totalBytes || item.transferredBytes,
                        speedMbps: 0,
                      }
                    : item
                )
              );
            }

            resolve();
          }
        );
      });
    };

    for (let index = 0; index < selectedFiles.length; index++) {
      const selectedFile = selectedFiles[index];
      const itemId = pendingItems[index].id;
      await uploadSingleFile(selectedFile, itemId, resolvedTagId);
    }

  };

  const uploadFiles = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    await processSelectedFiles(selectedFiles);
    event.target.value = "";
  };

  const onDropFiles = async (event) => {
    event.preventDefault();
    setIsDragActive(false);
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    await processSelectedFiles(droppedFiles);
  };

  const retryUpload = async (itemId) => {
    const item = uploadedItems.find((entry) => entry.id === itemId);
    if (!item || !item.file || !tagname) {
      return;
    }

    setUploadedItems((prev) =>
      prev.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              progress: 0,
              status: "uploading",
              transferredBytes: 0,
              speedMbps: 0,
              lastSampleBytes: 0,
              lastSampleTime: Date.now(),
            }
          : entry
      )
    );

    const db = app.firestore();
    let resolvedTagId = "";
    try {
      const tagSnapshot = await db
        .collection("tags")
        .where("name", "==", tagname)
        .limit(1)
        .get();
      if (!tagSnapshot.empty) {
        resolvedTagId = tagSnapshot.docs[0].id;
      }
    } catch (tagLookupError) {
      console.log("Tag lookup error:", tagLookupError);
    }
    const filename = item.file.name;
    const storageRef = app.storage().ref(`${tagname}`).child(filename);
    const uploadTask = storageRef.put(item.file);

    await new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const fileProgress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          const roundedProgress = Math.round(fileProgress);
          setUploadedItems((prev) =>
            prev.map((entry) =>
              entry.id === itemId
                ? {
                    ...entry,
                    progress: roundedProgress,
                    transferredBytes: snapshot.bytesTransferred,
                    totalBytes: snapshot.totalBytes,
                    speedMbps:
                      snapshot.bytesTransferred > (entry.lastSampleBytes || 0)
                        ? (snapshot.bytesTransferred - (entry.lastSampleBytes || 0)) /
                          (1024 * 1024) /
                          Math.max((Date.now() - (entry.lastSampleTime || Date.now())) / 1000, 0.15)
                        : entry.speedMbps || 0,
                    lastSampleBytes: snapshot.bytesTransferred,
                    lastSampleTime: Date.now(),
                  }
                : entry
            )
          );
        },
        (error) => {
          console.log(error);
          setUploadedItems((prev) =>
            prev.map((entry) =>
              entry.id === itemId ? { ...entry, status: "error" } : entry
            )
          );
          reject(error);
        },
        async () => {
          const downloadURL = await storageRef.getDownloadURL();

          try {
            if (resolvedTagId) {
              await db
                .collection("tags")
                .doc(resolvedTagId)
                .collection("files")
                .doc(filename)
                .set({
                  uploadedBy: user,
                  uploadedByUid: uid,
                  uploadedAt: new Date(),
                });

              queueThumbnailGeneration({
                selectedFile: item.file,
                filename,
                tagId: resolvedTagId,
                itemId,
              });
            }

            setUploadedItems((prev) =>
              prev.map((entry) =>
                entry.id === itemId
                  ? {
                      ...entry,
                      url: downloadURL,
                      progress: 100,
                      status: "done",
                      transferredBytes: entry.totalBytes || entry.transferredBytes,
                      speedMbps: 0,
                    }
                  : entry
              )
            );
          } catch (err) {
            console.log("Error storing file metadata:", err);
            setUploadedItems((prev) =>
              prev.map((entry) =>
                entry.id === itemId
                  ? {
                      ...entry,
                      url: downloadURL,
                      progress: 100,
                      status: "done",
                      transferredBytes: entry.totalBytes || entry.transferredBytes,
                      speedMbps: 0,
                    }
                  : entry
              )
            );
          }

          resolve();
        }
      );
    });
  };

  const requestAccess = () => {
    if (reqTags || notis || names) {
    }
    const db = app.firestore();
    db.collection("tags")
      .where("name", "==", tagname)
      .get()
      .then(function (querySnapshot) {
        querySnapshot.forEach(function (doc) {
          if (doc.data().requests.includes(uid)) {
            setRequestModal(true);
          } else {
            const db = app.firestore();
            db.collection("tags")
              .where("name", "==", tagname)
              .get()
              .then(function (querySnapshot) {
                querySnapshot.forEach(function (doc) {
                  db.collection("tags")
                    .doc(doc.id)
                    .update({
                      requests: firebase.firestore.FieldValue.arrayUnion(uid),
                      reqTags: firebase.firestore.FieldValue.arrayUnion(
                        tagname
                      ),
                      reqNames: firebase.firestore.FieldValue.arrayUnion(
                        user + " is requesting access for " + tagname
                      ),
                    });
                });
              });
            setReqModalSuccess(true);
          }
        });
      });
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
            aria-controls="upload-all-tags-sidebar"
          >
            {isTagSidebarOpen ? "Hide all tags" : "Browse all tags"}
          </button>

          <div className="manage-main-card" style={{ marginTop: "1rem" }}>
        <FormLabel
          style={{ color: "var(--muted)", fontWeight: "700", fontSize: "13px", letterSpacing: "0.07em", textTransform: "uppercase" }}
        >
          Tag Name
        </FormLabel>
        <InputGroup className="mb-3">
          <FormControl
            value={tagname}
            style={{
              height: "40px",
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              outline: "none",
              fontWeight: "bold",
            }}
            placeholder="Search Tag Name"
            aria-label="Search Tag Name"
            aria-describedby="basic-addon2"
            onChange={(e) => handleChange(e)}
            onKeyDown={eCheckBase}
          />
          <Button
            style={{ color: "var(--on-primary)", fontWeight: "bold" }}
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
          }}
          variant="danger"
        >
          Oops! The tag doesn't exist
        </Alert>
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
          </div>
          <div
            style={{
              display: `${showx}`,
            }}
            className="manage-main-files panel-shell"
          >
        <div
          className={`upload-dropzone ${isDragActive ? "is-drag-active" : ""}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setIsDragActive(false);
            }
          }}
          onDrop={onDropFiles}
        >
          <div className="upload-dropzone-illustration" aria-hidden="true">
            <UploadCloud size={24} />
          </div>
          <h4 className="upload-dropzone-title">Drop files here to upload</h4>
          <p className="upload-dropzone-subtitle">or use the button below to choose files from your device</p>

          <div className="upload-dropzone-actions">
            <Button
              id="cusbtn"
              onClick={() => fileInputRef.current?.click()}
              style={{ color: "var(--on-primary)", fontWeight: "700" }}
              disabled={!tagname}
            >
              Choose Files
            </Button>
            <Button
              variant="secondary"
              onClick={finaliseStuff}
              disabled={!uploadedItems.some((item) => item.status === "done")}
              style={{ fontWeight: "700" }}
            >
              Finalise
            </Button>
          </div>

          <input
            ref={fileInputRef}
            accept="*"
            type="file"
            multiple
            onChange={uploadFiles}
            name="image-uploader-multiple"
            disabled={!tagname}
            style={{ display: "none" }}
          />
        </div>

        <div
          style={{
            width: "100%",
            marginTop: "0.85rem",
          }}
        >
          <div className="file-grid">
            {uploadedItems.map((item) => {
              const iconData = getFileIconData(item.name);
              const previewUrl = item.thumbnailURL || item.url;
              return (
                <a
                  key={item.id}
                  href={item.url || "#"}
                  onClick={(e) => {
                    if (!item.url) {
                      e.preventDefault();
                    }
                  }}
                  className="upload-file-link"
                  style={{ textDecoration: "none", color: "var(--text)" }}
                >
                  <div className="file-tile-card upload-file-card">
                    <div className="file-tile-thumb">
                      {item.isImage && previewUrl ? (
                        <img
                          src={previewUrl}
                          alt=""
                          onError={(e) => {
                            if (item.url && e.currentTarget.src !== item.url) {
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
                        <span className="file-type-icon" style={{ color: iconData.color }}>
                          {iconData.icon}
                        </span>
                      )}
                    </div>

                    <div className="file-tile-body">
                      <div className="file-tile-name">{item.name}</div>
                      <div className="file-tile-uploader">{formatMB(item.totalBytes || 0)}</div>
                      <div style={{ marginTop: "auto" }}>
                        <ProgressBar
                          striped={item.status === "uploading"}
                          variant={item.status === "error" ? "danger" : "success"}
                          now={item.progress}
                          style={{ height: "7px", backgroundColor: "var(--surface-2)" }}
                        />
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--muted)",
                            marginTop: "6px",
                            fontWeight: "600",
                          }}
                        >
                          {item.status === "done"
                            ? "Uploaded"
                            : item.status === "error"
                              ? "Failed"
                              : `Uploading ${item.progress}%`}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--muted)",
                            marginTop: "2px",
                            fontWeight: "500",
                          }}
                        >
                          {`${formatMB(item.transferredBytes || 0)} / ${formatMB(item.totalBytes || 0)}${item.status === "uploading" ? ` • ${formatSpeed(item.speedMbps || 0)}` : ""}`}
                        </div>
                        {item.status === "error" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              retryUpload(item.id);
                            }}
                            style={{
                              marginTop: "6px",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              background: "var(--surface-2)",
                              color: "var(--text)",
                              fontSize: "11px",
                              fontWeight: "700",
                              padding: "3px 8px",
                              cursor: "pointer",
                            }}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
        <Modal
          show={shows}
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
              <b>Files Uploaded!</b>
            </Modal.Title>
          </Modal.Header>

          <Modal.Body
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--text)",
              border: "none",
            }}
          >
            Your files have been uploaded. The owner can now view your files.
          </Modal.Body>

          <Modal.Footer
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--text)",
              border: "none",
            }}
          >
            <Link to="/">
              <Button
                id="cusbtn"
                variant="secondary"
                onClick={handleClose}
                style={{ fontWeight: "bold" }}
              >
                Go Home
              </Button>
            </Link>
          </Modal.Footer>
        </Modal>

        <Modal
          show={shows1}
          onHide={handleClose}
          size="sm"
          aria-labelledby="contained-modal-title-vcenter"
          centered
        >
          <Modal.Header
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--danger)",
              border: "none",
            }}
          >
            <Modal.Title>
              <b>No Files :(</b>
            </Modal.Title>
          </Modal.Header>

          <Modal.Body
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--text)",
              border: "none",
            }}
          >
            Please add some files by clicking on "Choose Files"
          </Modal.Body>

          <Modal.Footer
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--text)",
              border: "none",
            }}
          >
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
          show={reqModal}
          onHide={handleClose}
          size="sm"
          aria-labelledby="contained-modal-title-vcenter"
          centered
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

          <Modal.Body
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--text)",
              border: "none",
            }}
          >
            Please wait till the owner approves your request.
          </Modal.Body>

          <Modal.Footer
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--text)",
              border: "none",
            }}
          >
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

          <Modal.Body
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--text)",
              border: "none",
            }}
          >
            Please wait till the owner approves your request.
          </Modal.Body>

          <Modal.Footer
            style={{
              backgroundColor: "var(--surface)",
              color: "var(--text)",
              border: "none",
            }}
          >
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

          </div>
        </div>

        <aside
          id="upload-all-tags-sidebar"
          className={`manage-tag-sidebar ${isTagSidebarOpen ? "is-open" : ""}`}
          aria-hidden={!isTagSidebarOpen}
        >
          <div className="manage-tag-head">
            <h3 className="manage-tag-title">All My Tags</h3>
            <span className="manage-tag-count">{normalizedMyTags.length}</span>
          </div>

          <div className="manage-tag-search-wrap">
            <FormControl
              className="manage-tag-search"
              placeholder="Search tags"
              value={myTagQuery}
              onChange={(e) => setMyTagQuery(e.target.value)}
              style={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                outline: "none",
              }}
            />
          </div>

          <div className="manage-tag-list" role="list" aria-label="All tags">
            {filteredAllTags.map((name) => (
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
              </div>
            ))}
            {!filteredAllTags.length && (
              <div className="manage-tag-empty">No tags found.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Upload;
