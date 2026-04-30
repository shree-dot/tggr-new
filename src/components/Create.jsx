import React from "react";
import app from "../base";
import { Form, Button, Modal } from "./ui/compat";
import { Link } from "react-router-dom";

const RANDOM_ADJECTIVES = [
  "brave",
  "bouncy",
  "clever",
  "cosmic",
  "dapper",
  "fuzzy",
  "happy",
  "jolly",
  "mighty",
  "nimble",
  "quirky",
  "rapid",
  "snappy",
  "sunny",
  "witty",
  "zesty",
];

const RANDOM_NAMES = [
  "ada",
  "babbage",
  "curie",
  "darwin",
  "einstein",
  "franklin",
  "hopper",
  "lovelace",
  "newton",
  "pasteur",
  "raman",
  "tesla",
  "turing",
  "watson",
];

const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];

const Create = () => {
  const [tagname, setTagName] = React.useState("");
  const [filename] = React.useState([]);
  const [access, setAccess] = React.useState(1);
  const [users, setUsers] = React.useState([]);
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [downloadURLs] = React.useState([]);
  const [date] = React.useState(new Date());
  const [description, setDescription] = React.useState("");
  const [validationErrors, setValidationErrors] = React.useState({});
  const [generatingName, setGeneratingName] = React.useState(false);

  const validateForm = () => {
    const errors = {};
    if (!tagname || tagname.trim() === "") {
      errors.tagname = "Tag name is required";
    } else if (tagname.length > 20) {
      errors.tagname = "Max 20 Characters";
    } else if (/\s/.test(tagname)) {
      errors.tagname = "Spaces Not Allowed";
    }
    return errors;
  };

  const createRandomTagName = () => {
    const adjective = pickRandom(RANDOM_ADJECTIVES);
    const name = pickRandom(RANDOM_NAMES);
    const suffix = Math.floor(Math.random() * 90) + 10;
    const withSuffix = `${adjective}_${name}_${suffix}`;
    const withoutSuffix = `${adjective}_${name}`;

    return withSuffix.length <= 20 ? withSuffix : withoutSuffix;
  };

  const tagExists = async (name) => {
    const snapshot = await app
      .firestore()
      .collection("tags")
      .where("name", "==", name)
      .get();

    return !snapshot.empty;
  };

  const generateRandomTagName = async () => {
    setGeneratingName(true);
    setValidationErrors({});

    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const randomName = createRandomTagName();
        const exists = await tagExists(randomName);

        if (!exists) {
          setTagName(randomName);
          setError(false);
          return;
        }
      }

      setTagName(createRandomTagName());
      setError(false);
    } catch (error) {
      setTagName(createRandomTagName());
      setError(false);
      console.log("Random tag name check failed:", error);
    } finally {
      setGeneratingName(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const cleanTagName = tagname.trim();
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    setTagName(cleanTagName);
    
    app
      .firestore()
      .collection("tags")
      .where("name", "==", cleanTagName)
      .get()
      .then(function (querySnapshot) {
        if (querySnapshot.docs.length >= 1) {
          setError(true);
        } else {
          const db = app.firestore();
          db.collection("tags").add({
            name: cleanTagName,
            filenames: filename,
            access: access,
            users: [`${users}`],
            urls: downloadURLs,
            date: date,
            lastActivityAt: date,
            owner: users,
            desc: description,
            requests: [],
            reqTags: [],
            reqNames: [],
          });
          handleShow();
        }
      })
      .catch(function (error) {
        console.log("Error getting documents: ", error);
      });
  };

  React.useEffect(() => {
    setUsers(app.auth().currentUser.uid);
  }, []);

  const handleClose = () => {
    setShow(false);
  };

  const handleError = () => {
    setError(false);
  };
  const handleShow = () => setShow(true);

  return (
    <div className="create-shell">
      <section className="create-intro panel-shell">
        <p className="create-kicker">Create A Tag</p>
        <h1 className="create-title">Start a new sharing space</h1>
        <p className="create-subtitle">
          Create a unique tag, set access rules, and invite people to collaborate quickly.
        </p>
      </section>

      <section className="create-form-card">
        <Form className="font-weight-bold" onSubmit={onSubmit}>
          <Form.Group controlId="formGroupEmail" className="create-field">
            <Form.Label className="create-label">Tag Name</Form.Label>
            <Form.Control
              className="create-input"
              type="text"
              placeholder="Unique Tag Name Here"
              value={tagname}
              onChange={(e) => setTagName(e.target.value)}
            />
            <p className="create-error">{validationErrors.tagname && validationErrors.tagname}</p>
            <button
              type="button"
              className="create-random-link"
              onClick={generateRandomTagName}
              disabled={generatingName}
            >
              {generatingName ? "Generating..." : "Or just click here and we will generate one for you"}
            </button>
          </Form.Group>

          <Form.Group controlId="exampleForm.ControlSelect2" className="create-field">
            <Form.Label className="create-label">Access Permissions</Form.Label>
            <Form.Control
              className="create-input"
              as="select"
              value={access}
              onChange={(e) => setAccess(e.target.value)}
            >
              <option value="1">Allow anyone with tag name</option>
              <option value="2">Allow when user requests</option>
            </Form.Control>
          </Form.Group>

          <Form.Group controlId="formGroupDesc" className="create-field">
            <Form.Label className="create-label">Description</Form.Label>
            <Form.Control
              className="create-input"
              type="text"
              placeholder="Enter a small description about this tag"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Form.Group>

          <Button id="cusbtn" variant="primary" type="submit" className="create-submit-btn">
            Create Tag
          </Button>
        </Form>
      </section>

      <Modal
        show={show}
        onHide={handleClose}
        size="md"
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
            <b>Tag Created!</b>
          </Modal.Title>
        </Modal.Header>

        <Modal.Body
          style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}
        >
          Share your tag name: <b style={{ fontSize: "20px" }}>{tagname}</b>
          <br />
          with your users so that they can start sharing.
          <br />
          Happy Collab!
        </Modal.Body>

        <Modal.Footer
          style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}
        >
          <Link to="/">
            <Button
              id="cusbtn"
              variant="secondary"
              onClick={handleClose}
              style={{ color: "var(--on-primary)", fontWeight: "bold" }}
            >
              Go Home
            </Button>
          </Link>
        </Modal.Footer>
      </Modal>

      <Modal
        show={error}
        onHide={handleError}
        size="md"
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
            <b>This tag already exists!</b>
          </Modal.Title>
        </Modal.Header>

        <Modal.Body
          style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}
        >
          Tag Name entered: <b style={{ fontSize: "20px" }}>{tagname}</b>
          <br />
          already exists. Please use another tag name.
        </Modal.Body>

        <Modal.Footer
          style={{ backgroundColor: "var(--surface)", color: "var(--text)", border: "none" }}
        >
          <Button
            id="cusbtn"
            type="button"
            onClick={generateRandomTagName}
            disabled={generatingName}
            style={{ color: "var(--on-primary)", fontWeight: "bold" }}
          >
            {generatingName ? "Generating..." : "Generate Name"}
          </Button>
          <Button
            id="cusbtn"
            variant="secondary"
            onClick={handleError}
            style={{ color: "var(--on-primary)", fontWeight: "bold" }}
          >
            Go Back
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default Create;
