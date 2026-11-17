#!/usr/bin/env bash
# Fails if any staged file is an env file or contains something shaped like a private key.
# Installed as .git/hooks/pre-commit by `bash scripts/check-secrets.sh --install`.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"

if [[ "${1:-}" == "--install" ]]; then
  printf '#!/usr/bin/env bash\nexec bash "%s/scripts/check-secrets.sh"\n' "$root" > "$root/.git/hooks/pre-commit"
  chmod +x "$root/.git/hooks/pre-commit"
  echo "pre-commit secret check installed"
  exit 0
fi

fail=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  case "$f" in
    *.env|*.env.*) [[ "$f" == *.env.example ]] || { echo "BLOCKED: env file staged: $f"; fail=1; } ;;
  esac
  # 64-hex-char strings assigned to key-like names, or PRIVATE_KEY= with a value
  if git show ":$f" 2>/dev/null | grep -Eiq '(private[_-]?key|secret|mnemonic|seed)[^\n]{0,20}[=:][[:space:]]*"?(0x)?[0-9a-f]{64}'; then
    echo "BLOCKED: possible private key in $f"; fail=1
  fi
done < <(git diff --cached --name-only --diff-filter=ACM)

if [[ $fail -ne 0 ]]; then
  echo "Commit aborted by scripts/check-secrets.sh"
  exit 1
fi
