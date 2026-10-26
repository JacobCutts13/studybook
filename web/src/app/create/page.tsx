"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

export default function Create() {
  const router = useRouter();
  const [profile, setProfile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    fetch("/api/books")
      .then((response) => response.json())
      .then((data) => setProfile(data.profile));
  }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/books", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      router.push("/library");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Upload failed.");
      setBusy(false);
    }
  }

  return (
    <main>
      <a className="back" href="/">
        <span className="arrow" aria-hidden="true">
          ←
        </span>
        studybook
      </a>
      <div className="page-head">
        <h1>Create a study guide</h1>
      </div>
      <p className="lede">
        Claude reads each chapter and writes a preview and a scenario quiz. A
        book usually takes a few minutes, and you can follow it in the library.
      </p>
      <form className="card form" onSubmit={upload}>
        <div className="field">
          <span className="field-label">Book PDF</span>
          <div className="file">
            <input
              id="pdf"
              name="pdf"
              type="file"
              accept="application/pdf"
              required
              className="visually-hidden"
              onChange={(event) =>
                setFileName(event.target.files?.[0]?.name ?? "")
              }
            />
            <label htmlFor="pdf" className="btn quiet">
              Choose PDF
            </label>
            <span className="file-name">{fileName || "No file chosen"}</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="profile" className="field-label">
            About you
          </label>
          <textarea
            id="profile"
            name="profile"
            value={profile}
            onChange={(event) => setProfile(event.target.value)}
            placeholder="e.g. I’m a product manager at a B2B software company, working on onboarding and pricing."
          />
          <p className="hint">
            Quiz scenarios come from your work. Remembered for next time.
          </p>
        </div>
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Uploading…" : "Make study guide"}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
