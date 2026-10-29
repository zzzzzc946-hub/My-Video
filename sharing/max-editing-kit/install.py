#!/usr/bin/env python3
"""Install the self-contained MAX skill; never replace an existing installation."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skills-dir', type=Path, default=Path.home() / '.codex/skills')
    parser.add_argument('--setup', action='store_true', help='Create Python venv and run pip install + npm ci (network required)')
    args = parser.parse_args()
    kit = Path(__file__).resolve().parent
    subprocess.run([sys.executable, str(kit / 'scripts/verify_package.py')], check=True)
    parent = args.skills_dir.expanduser().resolve()
    parent.mkdir(parents=True, exist_ok=True)
    destination = parent / 'max-jianji-skill'
    if destination.exists() or destination.is_symlink():
        parser.exit(1, 'Existing installation preserved. Choose another --skills-dir or back it up and move it manually.\n')
    staging = Path(tempfile.mkdtemp(prefix='.max-install-', dir=parent))
    try:
        shutil.copytree(kit / 'skills/max-jianji-skill', staging / 'max-jianji-skill')
        (staging / 'max-jianji-skill').rename(destination)
    finally:
        shutil.rmtree(staging)
    print('Installed:', destination)
    if args.setup:
        subprocess.run([sys.executable, str(destination / 'scripts/setup.py')], check=True)
    else:
        print('Next: run scripts/setup.py inside the installed skill using Python 3.10+.')
    print('Restart your agent session so it discovers max-jianji-skill.')

if __name__ == '__main__':
    main()
