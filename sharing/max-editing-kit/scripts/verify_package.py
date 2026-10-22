#!/usr/bin/env python3
"""Check payload integrity and accidental machine-specific/secret inclusions offline."""
from pathlib import Path
import hashlib
import json
import re

KIT = Path(__file__).resolve().parents[1]
EXCLUDED_PARTS = {'.git', 'node_modules', '.venv', '__pycache__', '.DS_Store'}


def payload():
    for path in sorted(KIT.rglob('*')):
        if any(part in EXCLUDED_PARTS for part in path.relative_to(KIT).parts):
            continue
        if path.is_file() and path.name != 'MANIFEST.json':
            yield path


def main():
    expected = json.loads((KIT / 'MANIFEST.json').read_text())['sha256']
    actual = {p.relative_to(KIT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in payload()}
    if actual != expected:
        raise SystemExit('Package integrity check failed: missing, changed or extra payload files.')
    errors = []
    for path in payload():
        if path.is_symlink(): errors.append(f'Symlink: {path.relative_to(KIT)}')
        if path.name.startswith('.env') and path.name != '.env.example': errors.append('Private environment file included')
        raw = path.read_bytes()
        try: text = raw.decode('utf-8')
        except UnicodeDecodeError: continue
        if re.search(r'(?:gh[pousr]_[A-Za-z0-9]{20,}|sk[-_][A-Za-z0-9]{24,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)', text):
            errors.append(f'Possible credential: {path.relative_to(KIT)}')
        if re.search(r'/' + 'Users' + r'/[^/\s]+/', text): errors.append(f'Original user path: {path.relative_to(KIT)}')
    if errors: raise SystemExit('\n'.join(errors))
    print(f'Package verified: {len(actual)} files; hashes, paths and basic credential scan passed.')

if __name__ == '__main__':
    main()
