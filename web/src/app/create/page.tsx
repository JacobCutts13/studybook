"use client";

import { useRouter } from "next/navigation";
import {
  type DragEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { PlusIcon } from "../icons";
import { PageDrop, type PageState } from "./page-drop";

// Long enough to see the page bind into a spine and lift off.
const BIND_MS = 700;

export default function Create() {
  const router = useRouter();
  const [profile, setProfile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pageState: PageState = busy
    ? "binding"
    : over
      ? "over"
      : fileName
        ? "filled"
        : "blank";

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
      const [response] = await Promise.all([
        fetch("/api/books", {
          method: "POST",
          body: new FormData(event.currentTarget),
        }),
        new Promise((resolve) => setTimeout(resolve, BIND_MS)),
      ]);
      if (!response.ok) throw new Error((await response.json()).error);
      router.push("/library");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Upload failed.");
      setBusy(false);
    }
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (!file || !input.current) return;
    const files = new DataTransfer();
    files.items.add(file);
    input.current.files = files.files;
    setFileName(file.name);
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
      <form className="card form create-form" onSubmit={upload}>
        <div className="drop">
          <input
            ref={input}
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
          <label
            htmlFor="pdf"
            className="page-drop"
            data-state={pageState}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={(event) => {
              // Moving over the label's own children isn't leaving.
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setOver(false);
            }}
            onDrop={drop}
          >
            <PageDrop state={pageState} />
            <span className="page-drop-label">
              {fileName ? (
                <>
                  <span className="page-drop-name">{fileName}</span>
                  <span className="hint">Choose a different PDF</span>
                </>
              ) : (
                <>
                  <span className="page-drop-icon">
                    <PlusIcon />
                  </span>
                  <span className="page-drop-name">
                    {over ? "Drop to add" : "Drop a book PDF"}
                  </span>
                  <span className="hint">or click to choose one</span>
                </>
              )}
            </span>
          </label>
        </div>
        <div className="create-fields">
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
        </div>
      </form>
    </main>
  );
}
