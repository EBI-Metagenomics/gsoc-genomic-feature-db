# gsoc-genomic-feature-db
GSOC Project #14 - A genomic feature database in the browser






## Development - initial doc

### Code Style - suggested 


- **[Black](https://black.readthedocs.io/)**: Python code formatting
- **[Ruff](https://docs.astral.sh/ruff/)**: Python linting

#### Pre-commit Hooks

Pre-commit hooks are configured to run automatically:

```bash
# Install hooks
pre-commit install

# Run manually on all files
pre-commit run --all-files
```

#### Manual Formatting

```bash

# install dependencies
pip install ruff black

# Format code with Black
black .

# Lint and fix with Ruff
ruff check --fix .
```