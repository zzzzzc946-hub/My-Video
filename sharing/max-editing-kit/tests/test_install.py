import pathlib
import subprocess
import sys
import tempfile
import unittest

KIT = pathlib.Path(__file__).resolve().parents[1]

class InstallTests(unittest.TestCase):
    def test_copy_is_self_contained_and_existing_install_is_preserved(self):
        with tempfile.TemporaryDirectory(prefix='max kit space ') as temporary:
            destination = pathlib.Path(temporary) / 'skills'
            command = [sys.executable, str(KIT / 'install.py'), '--skills-dir', str(destination)]
            installed = destination / 'max-jianji-skill'
            first = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertTrue((installed / 'references/max-system/03｜MAX粗剪判断标准.md').is_file())
            self.assertTrue((installed / 'assets/video-use/helpers/render.py').is_file())
            self.assertTrue((installed / 'assets/runtime/workbench/server/index.ts').is_file())
            self.assertFalse(any(path.is_symlink() for path in installed.rglob('*')))
            marker = installed / 'keep-local-feedback.txt'
            marker.write_text('preserve')
            again = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(again.returncode, 0)
            self.assertEqual(marker.read_text(), 'preserve')
            self.assertFalse((installed / 'assets/video-use/.env').exists())

if __name__ == '__main__':
    unittest.main()
