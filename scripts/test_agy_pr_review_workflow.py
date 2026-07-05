import re
import unittest
from pathlib import Path


WORKFLOW_PATH = Path(".github/workflows/agy-pr-review.yml")


class AgyReviewWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.assertTrue(WORKFLOW_PATH.is_file(), "agy review workflow file is missing")
        self.workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    def test_uses_pull_request_target_for_develop_prs(self):
        self.assertIn("pull_request_target:", self.workflow)
        self.assertNotRegex(self.workflow, r"(?m)^  pull_request:\s*$")
        for event_type in ["opened", "reopened", "synchronize", "ready_for_review"]:
            self.assertIn(f"      - {event_type}", self.workflow)
        self.assertIn("    branches:\n      - develop", self.workflow)

    def test_permissions_are_minimal_for_diff_read_and_comment_write(self):
        self.assertIn("permissions:", self.workflow)
        self.assertIn("  contents: read", self.workflow)
        self.assertIn("  pull-requests: read", self.workflow)
        self.assertIn("  issues: write", self.workflow)
        self.assertNotIn("contents: write", self.workflow)
        self.assertNotIn("pull-requests: write", self.workflow)

    def test_uses_dedicated_self_hosted_runner(self):
        self.assertIn("runs-on: [self-hosted, macOS, documind-agy-review]", self.workflow)

    def test_checks_out_base_sha_only(self):
        self.assertIn("uses: actions/checkout@v4", self.workflow)
        self.assertIn("ref: ${{ github.event.pull_request.base.sha }}", self.workflow)
        self.assertNotIn("github.event.pull_request.head.ref", self.workflow)
        self.assertNotIn("github.event.pull_request.head.sha", self.workflow)

    def test_runs_existing_review_script_with_github_token(self):
        self.assertIn("GH_TOKEN: ${{ github.token }}", self.workflow)
        self.assertIn("PR_NUMBER: ${{ github.event.pull_request.number }}", self.workflow)
        self.assertIn('scripts/agy-pr-review "$PR_NUMBER" --post --timeout 10m', self.workflow)

    def test_does_not_run_pr_head_package_scripts(self):
        forbidden_patterns = [
            r"\bnpm\s+run\b",
            r"\bnpm\s+test\b",
            r"\byarn\b",
            r"\bpnpm\b",
            r"\bnpx\b",
        ]
        for pattern in forbidden_patterns:
            self.assertIsNone(re.search(pattern, self.workflow), f"forbidden command found: {pattern}")


if __name__ == "__main__":
    unittest.main()
