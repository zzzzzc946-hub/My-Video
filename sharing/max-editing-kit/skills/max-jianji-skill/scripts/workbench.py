#!/usr/bin/env python3
"""Launch the bundled local workbench; no original-machine paths required."""
from pathlib import Path
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def main():
    runtime = ROOT / 'assets/runtime'
    vendor = ROOT / 'assets/video-use'
    python = vendor / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not python.is_file() or not (runtime / 'node_modules/.bin/tsx').exists():
        raise SystemExit('Run scripts/setup.py first.')
    environment = dict(os.environ, MAX_VIDEO_PYTHON=str(python))
    environment['PATH'] = str(python.parent) + os.pathsep + environment.get('PATH', '')
    command = [shutil.which('npm') or 'npm', 'run', 'workbench', '--', '--with-web']
    try:
        raise SystemExit(subprocess.call(command, cwd=runtime, env=environment))
    except KeyboardInterrupt:
        pass

if __name__ == '__main__':
    main()
