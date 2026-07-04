import importlib.util
import io
import unittest
from contextlib import redirect_stderr, redirect_stdout
from importlib.machinery import SourceFileLoader
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("agy-pr-review-batch")
SPEC = importlib.util.spec_from_loader(
    "agy_pr_review_batch",
    SourceFileLoader("agy_pr_review_batch", str(SCRIPT_PATH)),
)
agy_pr_review_batch = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(agy_pr_review_batch)


class BuildCommandTest(unittest.TestCase):
    def test_build_command_forwards_review_options(self):
        args = agy_pr_review_batch.parse_args(
            [
                "46",
                "48",
                "--repo",
                "documind-ai-lab/documind-backend",
                "--post",
                "--timeout",
                "10m",
                "--model",
                "Gemini 3.1 Pro (High)",
                "--max-diff-bytes",
                "500000",
            ]
        )

        command = agy_pr_review_batch.build_command(args, "46")

        self.assertEqual(command[2], "46")
        self.assertIn("--repo", command)
        self.assertIn("documind-ai-lab/documind-backend", command)
        self.assertIn("--post", command)
        self.assertIn("--timeout", command)
        self.assertIn("10m", command)
        self.assertIn("--model", command)
        self.assertIn("Gemini 3.1 Pro (High)", command)
        self.assertIn("--max-diff-bytes", command)
        self.assertIn("500000", command)

    def test_update_existing_requires_post(self):
        with redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                agy_pr_review_batch.parse_args(["46", "--update-existing"])


class BatchRunTest(unittest.TestCase):
    def test_main_continues_after_failure_and_returns_error(self):
        original_run_review = agy_pr_review_batch.run_review
        calls = []

        def fake_run_review(command):
            pr_number = command[2]
            calls.append(pr_number)
            if pr_number == "48":
                return 1
            return 0

        agy_pr_review_batch.run_review = fake_run_review
        try:
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                exit_code = agy_pr_review_batch.main_with_args(["46", "48", "50", "--post"])
        finally:
            agy_pr_review_batch.run_review = original_run_review

        self.assertEqual(exit_code, 1)
        self.assertEqual(calls, ["46", "48", "50"])

    def test_main_stops_after_failure_when_requested(self):
        original_run_review = agy_pr_review_batch.run_review
        calls = []

        def fake_run_review(command):
            pr_number = command[2]
            calls.append(pr_number)
            return 1

        agy_pr_review_batch.run_review = fake_run_review
        try:
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                exit_code = agy_pr_review_batch.main_with_args(["46", "48", "--post", "--stop-on-error"])
        finally:
            agy_pr_review_batch.run_review = original_run_review

        self.assertEqual(exit_code, 1)
        self.assertEqual(calls, ["46"])


if __name__ == "__main__":
    unittest.main()
