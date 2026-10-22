#!/usr/bin/env python3
"""Create a verified share ZIP using only manifest-listed files."""
from pathlib import Path
import argparse
import json
import subprocess
import sys
import zipfile

KIT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    subprocess.run([sys.executable, str(KIT / 'scripts/verify_package.py')], check=True)
    files = json.loads((KIT / 'MANIFEST.json').read_text())['sha256']
    output = args.output.expanduser().resolve()
    if output == KIT or KIT in output.parents:
        parser.error('Put the ZIP outside the kit directory.')
    if output.exists(): parser.error('Output already exists; choose a new filename.')
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'x', zipfile.ZIP_DEFLATED) as archive:
        for relative in sorted([*files, 'MANIFEST.json']):
            archive.write(KIT / relative, 'max-editing-kit/' + relative)
    print(output)

if __name__ == '__main__':
    main()
