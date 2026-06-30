# gsoc-genomic-feature-db
GSOC Project #14 - A genomic feature database in the browser

This project provides a serverless, local-first search interface for massive genomic datasets. It parses `.gff.gz` files into a compact, highly optimized SQLite database with FTS5 (Full-Text Search), which is then queried directly in the browser using a Web Worker and `sqlite-wasm-http` via HTTP Range requests.

## Project Structure

- **`scripts/`**: Contains Python backend tools, primarily `indexer.py`, which parses genomic data and outputs an optimized FTS5 SQLite database.
- **`ui-component/`**: The frontend React/Vite application. 
  - `src/component/`: UI components like the debounced `SearchBar`.
  - `src/workers/`: The Web Worker (`db.worker.ts`) handling asynchronous SQLite VFS operations.
- **`database/`**: The output directory for the generated `genomics.db.zip` database. This directory is served statically by Vite.

## Getting Started

### 1. Database Generation (Backend)

First, generate the SQLite database from your genomic `.gff` files. You will need Python 3 installed.

```bash
# Install python requirements (if applicable)
pip install ruff black

# Run the indexer script on your data
python scripts/indexer.py sample_data/GCF_000001215.4_Release_6_plus_ISO1_MT_genomic.gff.gz -o database/genomics.db.zip
```
*(The generated database is saved to the `database/` folder, which is statically served by the frontend).*

### 2. Running the Frontend App

Once the database is generated, navigate to the UI component directory and start the Vite development server:

```bash
cd ui-component

# Install Node.js dependencies
npm install

# Start the dev server
npm run dev
```

Open `http://localhost:5173/` in your browser. The app will securely load the local SQLite database and provide millisecond search capabilities!

---

## Code Style & Contributing

This project enforces standard formatting and linting for Python code.

- **[Black](https://black.readthedocs.io/)**: Python code formatting
- **[Ruff](https://docs.astral.sh/ruff/)**: Python linting

### Pre-commit Hooks

Pre-commit hooks are configured to run automatically and ensure all code is formatted before it is committed.

```bash
# Install hooks (run once)
pre-commit install

# Run manually on all files
pre-commit run --all-files
```

### Manual Formatting

If you want to manually format or lint your Python scripts without committing:

```bash
# Format code with Black
black .

# Lint and fix with Ruff
ruff check --fix .
```