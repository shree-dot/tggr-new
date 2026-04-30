import React from "react";
import app from "../base";
import { Form, Button, Modal } from "./ui/compat";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";

const Create = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const onSubmit = (data) => {
    app
      .firestore()
      .collection("tags")
      .where("name", "==", tagname)
      .get()
      .then(function (querySnapshot) {
        if (querySnapshot.docs.length >= 1) {
          setError(true);
        } else {
          const db = app.firestore();
          db.collection("tags").add({
            name: tagname,
            filenames: filename,
            access: access,
            users: [`${users}`],
            urls: downloadURLs,
            date: date,
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

  const [tagname, setTagName] = React.useState("");
  const [filename] = React.useState([]);
  const [access, setAccess] = React.useState(1);
  const [users, setUsers] = React.useState([]);
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [downloadURLs] = React.useState([]);
  const [date] = React.useState(new Date());
  const [description, setDescription] = React.useState("");

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
        <Form className="font-weight-bold" onSubmit={handleSubmit(onSubmit)}>
          <Form.Group controlId="formGroupEmail" className="create-field">
            <Form.Label className="create-label">Tag Name</Form.Label>
            <Form.Control
              className="create-input"
              type="text"
              placeholder="Unique Tag Name Here"
              value={tagname}
              onChange={(e) => setTagName(e.target.value)}
              {...register("tagname", {
                required: "Tag name is required",
                maxLength: {
                  value: 20,
                  message: "Max 20 Characters",
                },
                pattern: {
                  value: /^[\S]+$/,
                  message: "Spaces Not Allowed",
                },
              })}
            />
            <p className="create-error">{errors.tagname && errors.tagname.message}</p>
            <a href="/" className="create-random-link">
              Or click here and we will generate a unique tag name
            </a>
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
