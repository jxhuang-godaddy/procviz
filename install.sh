#!/usr/bin/env bash
set -e

echo "=== ProcViz Installer ==="

# Install uv if not present
if ! command -v uv &>/dev/null; then
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi

# Clone repo
INSTALL_DIR="$HOME/procviz"
if [ -d "$INSTALL_DIR" ]; then
    echo "Updating existing installation..."
    cd "$INSTALL_DIR" && git pull
else
    echo "Cloning ProcViz..."
    git clone https://github.com/your-org/procviz.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install dependencies
echo "Installing dependencies..."
uv sync

# Prompt for credentials
if [ ! -f .env ]; then
    echo ""
    echo "=== Teradata Configuration ==="
    read -rp "Teradata host: " TD_HOST
    read -rp "Teradata port [1025]: " TD_PORT
    TD_PORT=${TD_PORT:-1025}
    read -rp "Teradata username: " TD_USER
    read -rsp "Teradata password: " TD_PASSWORD
    echo ""

    cat > .env <<EOF
TD_HOST=$TD_HOST
TD_PORT=$TD_PORT
TD_USER=$TD_USER
TD_PASSWORD=$TD_PASSWORD
EOF
    echo ".env created."
fi

echo ""
echo "=== Starting ProcViz ==="
bash start.sh
