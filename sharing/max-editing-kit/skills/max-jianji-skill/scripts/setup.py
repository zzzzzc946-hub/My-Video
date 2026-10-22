#!/usr/bin/env python3
"""Install this skill's runtime dependencies. Downloads packages; does not transcribe media."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]

def main():
    if sys.version_info < (3, 10):
        raise SystemExit('Python 3.10+ required. Run this script with a newer interpreter, e.g. python3.12.')
    for executable in ['node', 'npm', 'ffmpeg', 'ffprobe']:
        if not shutil.which(executable):
            raise SystemExit(f'Missing {executable}; install it and reopen your terminal.')
    version = subprocess.check_output(['node', '--version'], text=True).strip().lstrip('v')
    major, minor = [int(part) for part in version.split('.')[:2]]
    if major < 22 or (major == 22 and minor < 12):
        raise SystemExit('Use Node.js 22.12+ (Node.js 24 is also supported).')
    vendor = ROOT / 'assets/video-use'
    environment = vendor / '.venv'
    if not environment.exists():
        venv.create(environment, with_pip=True)
    python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    subprocess.run([str(python), '-m', 'pip', 'install', '-r', str(vendor / 'requirements.lock.txt')], check=True)
    subprocess.run([str(python), '-m', 'pip', 'install', '--no-deps', str(vendor)], check=True)
    npm = shutil.which('npm')
    subprocess.run([npm, 'ci', '--no-audit', '--no-fund'], cwd=ROOT / 'assets/runtime', check=True)
    print('Runtime installed. Configure your own ElevenLabs key locally, then run scripts/doctor.py.')

if __name__ == '__main__':
    main()
