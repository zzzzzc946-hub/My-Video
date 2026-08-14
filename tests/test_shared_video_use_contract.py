from pathlib import Path
import unittest


PROJECT = Path(__file__).resolve().parents[1]
VIDEO_USE_SKILL = Path.home() / ".codex" / "skills" / "video-use" / "SKILL.md"
MAX_SKILL = PROJECT / ".codex" / "skills" / "max-jianji-skill" / "SKILL.md"


class SharedVideoUseContractTest(unittest.TestCase):
    def test_global_skill_reuses_shared_credentials_without_prompting(self) -> None:
        text = VIDEO_USE_SKILL.read_text(encoding="utf-8")
        self.assertIn("共享凭证", text)
        self.assertIn("不得要求用户重复粘贴", text)
        self.assertIn("ELEVENLABS_API_KEY", text)

    def test_max_skill_keeps_cleanup_and_tool_selection_separate(self) -> None:
        text = MAX_SKILL.read_text(encoding="utf-8")
        self.assertIn("10GB", text)
        self.assertIn("每条视频完成时", text)
        self.assertIn("不得自动删除", text)
        self.assertIn("工具无关", text)
        self.assertIn("不得启动未被选定工具", text)
        self.assertIn("默认执行工具：VideoUse", text)
        self.assertIn("用 MAX 剪辑工作流做粗剪", text)


if __name__ == "__main__":
    unittest.main()
