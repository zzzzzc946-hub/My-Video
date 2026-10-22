#!/usr/bin/env python3
"""Offline dependency check. Never prints credentials or sends media."""
from pathlib import Path
import json
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def main():
    missing = []
    for executable in ['node', 'npm', 'ffmpeg', 'ffprobe']:
        ok = bool(shutil.which(executable))
        print(executable + ': ' + ('OK' if ok else 'MISSING'))
        if not ok: missing.append(executable)
    if shutil.which('node'):
        try:
            version = subprocess.check_output(['node', '--version'], text=True).strip().lstrip('v')
            major, minor = map(int, version.split('.')[:2])
            if major < 22 or (major == 22 and minor < 12): missing.append('Node.js 22.12+')
        except (ValueError, subprocess.CalledProcessError): missing.append('Node.js version')
    vendor = ROOT / 'assets/video-use'
    python = vendor / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not python.is_file():
        missing.append('Python venv; run scripts/setup.py')
    else:
        check = subprocess.run([str(python), '-c', 'import sys, requests, librosa, matplotlib, PIL, numpy; assert sys.version_info >= (3,10)'], capture_output=True)
        if check.returncode: missing.append('Python dependencies; rerun scripts/setup.py')
    if not (ROOT / 'assets/runtime/node_modules/.bin/tsx').exists():
        missing.append('Node dependencies; run scripts/setup.py')
    key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    env = vendor / '.env'
    if not key and env.is_file():
        for line in env.read_text().splitlines():
            if line.strip().startswith('ELEVENLABS_API_KEY='):
                key = line.split('=', 1)[1].strip().strip('\"\'')
    print('Transcription credential: ' + ('CONFIGURED (not contacted)' if key else 'NOT CONFIGURED; needed only for new transcription'))
    for issue in missing: print('MISSING:', issue)
    print('Audio listening and continuous lip-sync review: NOT VERIFIED; requires an actual perceptual reviewer.')
    return 1 if missing else 0

if __name__ == '__main__':
    raise SystemExit(main())
