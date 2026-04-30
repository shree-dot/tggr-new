import React from "react";
import { Link } from "react-router-dom";
import create from "../svg/create.png";
import upload from "../svg/upload.png";
import manage from "../svg/manage.png";

const Menu = () => {
  return (
    <div className="menu-shell">
      <section className="menu-hero panel-shell">
        <p className="menu-kicker">Workspace Hub</p>
        <h1 className="menu-title">Share files with your team, minus the chaos.</h1>
        <p className="menu-subtitle">
          Create focused tags, upload in seconds, and manage everything from one place.
        </p>
        <div className="menu-actions">
          <Link id="cusbtn" className="menu-cta menu-cta-primary" to="/upload">
            Start Uploading
          </Link>
          <Link className="menu-cta menu-cta-secondary" to="/create">
            Create A Tag
          </Link>
        </div>
      </section>

      <section className="menu-grid" aria-label="Main actions">
        <article className="menu-card menu-card-create">
          <img className="menu-card-art" src={create} alt="Create tags" />
          <h3 className="menu-card-title">Create Tags</h3>
          <p className="menu-card-text">
            Start collaboration spaces instantly with access controls and clear ownership.
          </p>
          <Link id="cusbtn" className="menu-card-link" to="/create">
            Go To Create
          </Link>
        </article>

        <article className="menu-card menu-card-upload">
          <img className="menu-card-art" src={upload} alt="Upload files" />
          <h3 className="menu-card-title">Upload Files</h3>
          <p className="menu-card-text">
            Drop files into the right tag and keep your team in sync with minimal friction.
          </p>
          <Link id="cusbtn" className="menu-card-link" to="/upload">
            Go To Upload
          </Link>
        </article>

        <article className="menu-card menu-card-manage">
          <img className="menu-card-art" src={manage} alt="Manage tags" />
          <h3 className="menu-card-title">Manage Tags</h3>
          <p className="menu-card-text">
            Review files, approvals, and ownership details in one streamlined dashboard.
          </p>
          <Link id="cusbtn" className="menu-card-link" to="/manage">
            Go To Manage
          </Link>
        </article>
      </section>
    </div>
  );
};

export default Menu;
