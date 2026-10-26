# studybook: instructions for agents

studybook turns a book PDF into a study guide (a preview, the real pages and a scenario quiz for
each chapter). The guide is written by the user's own Claude Code login, and the reader runs at
http://127.0.0.1:4747. Everything is driven from the command line; you never need the web UI.

## Making study guides for the user

1. **Check prerequisites.**
   - `node -v` must be 24 or later, and `pnpm -v` must work.
   - `claude auth status` must report `loggedIn: true`. If it doesn't, ask the user to run
     `claude auth login` themselves. Never handle their credentials.
2. **Install** (skip if the repo is already there):
   ```bash
   git clone https://github.com/JacobCutts13/studybook ~/studybook
   cd ~/studybook && pnpm install
   ```
3. **Find the PDFs** in the place the user named (for example `~/Downloads`). Ask if it's
   unclear which files they mean, and don't search their whole disk. Only use books they're
   allowed to use. You don't need to copy anything: `add` copies each PDF into `~/.studybook`.
4. **Write the "about"**: one or two sentences on the user's work (role, company, product, the
   decisions they make) and their spelling conventions. It shapes the quiz scenarios. Use work
   context only, never sensitive personal details. Tell the user what you used.
5. **Make the guides.** Run this in the background, because it takes a few minutes per book:
   ```bash
   pnpm studybook add ~/Downloads/book-one.pdf ~/Downloads/book-two.pdf --about "…"
   ```
   It prints a line each time a book's phase changes. On success it ends with
   `Ready: <title> <url>` for each book and exits 0.
   - **On exit 1** it lists the chapters that failed and prints `pnpm studybook retry <id>`.
     Run that: finished chapters are kept, so it only redoes what's missing. The usual cause is
     a usage limit on the user's plan; tell them if retries keep failing.
   - **If you lose track of a run**, `pnpm studybook status --json` lists every book with its
     status and URL, and `pnpm studybook wait <id>` follows one that's still being written.
6. **Start the reader** in the background: `pnpm studybook serve`, and **leave it running**,
   because the user reads at that address. If it's already running, it just says so. If you
   ever need to stop it, use `pnpm studybook stop`, which stops only the reader on
   `STUDYBOOK_PORT`. Never stop it with `pkill` or a name pattern: that also kills other
   people's studybook and Next servers on the machine.
7. **Give the user the URLs** from the `Ready:` lines. Mention that the reader works while
   `serve` is running, and that their highlights and notes are saved in `~/.studybook`.

Cost: each book is one Claude run to find the chapters plus one per chapter, on Opus by default.
Prefix the command with `STUDYBOOK_MODEL=sonnet` to use less of the user's plan.

Don't edit files under `~/.studybook` by hand, don't change this repo's code while making guides,
and don't publish or share the PDFs or the guides anywhere.

## Working on studybook itself

- `pnpm lint && pnpm typecheck && pnpm test`: unit tests plus the whole pipeline, using
  `local/fake-claude.mjs` instead of Claude Code.
- `pnpm e2e:setup && pnpm e2e`: browser test. Stop any `pnpm dev`/`serve` first, because Next
  allows only one dev server per project folder.
- Key files: `local/worker.mjs` (pipeline), `local/prompts.mjs`, `local/validate.mjs`,
  `local/cli.mjs`, `local/books.mjs` (shared by the CLI and the web API),
  `web/study/template.html` (study page).
