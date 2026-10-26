# studybook

Turn a book PDF into a study guide. For every chapter you get:

1. **Preview**: one sentence and two questions to keep in mind.
2. **Read**: the real pages of your PDF, with highlights and comments.
3. **Quiz**: 4–8 scenario questions drawn from your own work.

**My notes** collects every highlight across the book.

The guide is written by your own [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) login (subscription or API key). It runs on your computer at http://127.0.0.1:4747, and your PDF stays there.

## Let your agent set it up

Paste this into Claude Code (or any coding agent on a machine where Claude Code is logged in):

> Install studybook from https://github.com/JacobCutts13/studybook and follow its AGENTS.md. Make study guides for the book PDFs in ~/Downloads that I name: `<book.pdf>`. Write the "about" from what you know about my work, then give me the links to read them.

The agent runs everything from the command line (see [AGENTS.md](AGENTS.md)), so it never has to click through the UI. A 120-page book takes about 4 minutes.

## Quick start

Requirements:

- macOS or Linux
- Node.js 24
- pnpm
- Claude Code, installed and logged in (`claude auth status` should report `loggedIn: true`)

```bash
git clone https://github.com/JacobCutts13/studybook
cd studybook
pnpm install
```

### From the command line

```bash
pnpm studybook add ~/Downloads/the-mom-test.pdf --about "I'm a product manager at a B2B software company."
pnpm studybook serve
```

`add` prints a line as each book moves through its phases and ends with the link to read it. You can pass several PDFs at once. The commands:

| Command | What it does |
| --- | --- |
| `add <pdf…> [--about "…"]` | Makes study guides and waits for them. `--about` is remembered for next time. |
| `wait <id>` | Follows a book that's still being written. |
| `retry <id>` | Resumes a stopped book, redoing only what's missing. |
| `status [--json]` | Lists books with their status and links. |
| `serve` | Starts the reader, or says so if it's already running. |
| `stop` | Stops the reader that `serve` started on this port. |

Add `--no-wait` to `add` or `retry` to return straight away. Each command exits 1 with a clear message if something goes wrong.

### In the browser

Run `pnpm dev`, open http://127.0.0.1:4747, choose a PDF, say a sentence or two about what you do, and press **Make study guide**. The library shows each chapter's progress, and **Study** appears when it's ready.

## How it works

```
web upload or `studybook add`  ──▶  ~/.studybook/books/<id>/book.pdf
                                   │
                         local/worker.mjs (detached)
                                   │
   1. read the PDF        pdf.js → pages/p0001.txt …, candidates.json
   2. find chapters       claude -p → outline.json
   3. write chapters      claude -p per chapter (2 at a time) → chapters/<id>.json
   4. check               structure, page ranges, copied-wording check;
                          failures go back to Claude with the errors (up to 3 tries)
   5. assemble            book.json
```

- **Fixed code, not Claude, does the checking.** The worker validates every file Claude writes before anything reaches the study page.
- **Retries pick up where they stopped.** Finished chapters are kept, so if a run stops (a usage limit, a reboot), **Retry** redoes only what's missing.
- **The study page reads your PDF from the book's folder** and renders it with pdf.js. Highlights, comments and progress are saved next to it as `notes.json` and `progress.json`.

### How Claude is run

Each step runs `claude -p` inside the book's folder with these settings:

- **Only the Read and Write tools**, and only for paths inside that folder (`--tools Read,Write --allowedTools "Read(./**)" "Edit(./**)" --permission-mode dontAsk`). There's no shell and no web access.
- **None of your own setup is loaded:** no MCP servers, settings, hooks or skills (`--strict-mcp-config --setting-sources "" --disable-slash-commands`). The runs aren't saved to your session history (`--no-session-persistence`).
- **Book text is untrusted input.** The prompts tell Claude to ignore instructions found in it, and the HTML Claude writes is escaped before it reaches the page.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `STUDYBOOK_MODEL` | `opus` | Claude Code model alias. `sonnet` uses less of your plan. |
| `STUDYBOOK_CONCURRENCY` | `2` | Chapters written at the same time. |
| `STUDYBOOK_DATA` | `~/.studybook` | Where books, notes and progress are stored. |
| `STUDYBOOK_PORT` | `4747` | Port for the reader. |
| `STUDYBOOK_CLAUDE_COMMAND` | `claude` | Path to Claude Code if it isn't on `PATH`. |

A 15-chapter book is about 16 Claude runs.

## Privacy and copyright

- **Bring a book you're allowed to use.** studybook doesn't share, upload or publish your PDF.
- **What leaves your computer:** the chapter text Claude reads goes to Anthropic through your own Claude Code login. Nothing else does.
- **Original content:** the previews and quizzes are Claude's own words. Any 10-word run that matches the book is rejected and rewritten.
- **Localhost only:** the server binds to `127.0.0.1` and has no login. Don't expose it to a network.

## Development

```bash
pnpm lint && pnpm typecheck && pnpm test   # unit tests + full pipeline with a fake claude
pnpm e2e:setup && pnpm e2e                 # browser test (Playwright, network blocked)
```

The tests use `local/fake-claude.mjs` in place of Claude Code and an invented sample book (`pnpm fixture`), so they need no login.

| Path | What it is |
| --- | --- |
| `local/worker.mjs` | The pipeline |
| `local/prompts.mjs` | What Claude is asked |
| `local/validate.mjs` | What's checked |
| `web/` | The Next.js app |
| `web/study/template.html` | The study page |

## Troubleshooting

| Problem | Check |
| --- | --- |
| A book stops at "Finding the chapters" | Run `claude auth status`, then read `~/.studybook/books/<id>/claude.log`. |
| A chapter keeps failing | Open "Why … failed" in the library, then press **Retry**. |
| `claude` isn't found | Set `STUDYBOOK_CLAUDE_COMMAND` to its full path. |

## Licence

[MIT](LICENSE). Copyright (c) 2026 Jacob Cutts.
