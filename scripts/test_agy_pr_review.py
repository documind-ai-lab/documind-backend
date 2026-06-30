import importlib.util
import json
import unittest
from pathlib import Path
from importlib.machinery import SourceFileLoader


SCRIPT_PATH = Path(__file__).with_name("agy-pr-review")
SPEC = importlib.util.spec_from_loader("agy_pr_review", SourceFileLoader("agy_pr_review", str(SCRIPT_PATH)))
agy_pr_review = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(agy_pr_review)


class PostReviewCommentTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.original_viewer_login = agy_pr_review.viewer_login
        self.original_gh_api = agy_pr_review.gh_api
        agy_pr_review.viewer_login = lambda cwd: "rowing0328"

    def tearDown(self):
        agy_pr_review.viewer_login = self.original_viewer_login
        agy_pr_review.gh_api = self.original_gh_api

    def fake_gh_api(self, path, cwd, method="GET", payload=None, paginate=False, slurp=False):
        self.calls.append(
            {
                "path": path,
                "method": method,
                "payload": payload,
                "paginate": paginate,
                "slurp": slurp,
            }
        )
        if path == "repos/documind-ai-lab/documind-backend/issues/24/comments":
            return json.dumps(
                [
                    [
                        {
                            "id": 1001,
                            "user": {"login": "rowing0328"},
                            "body": "<!-- agy-pr-review -->\nold review",
                        }
                    ]
                ]
            )
        return "{}"

    def test_posts_new_comment_by_default_even_when_previous_marker_comment_exists(self):
        agy_pr_review.gh_api = self.fake_gh_api

        action = agy_pr_review.post_or_update_comment(
            "documind-ai-lab/documind-backend",
            "24",
            "new review",
            Path.cwd(),
            update_existing=False,
        )

        self.assertEqual(action, "created")
        self.assertEqual(self.calls[-1]["method"], "POST")
        self.assertEqual(
            self.calls[-1]["path"],
            "repos/documind-ai-lab/documind-backend/issues/24/comments",
        )

    def test_updates_existing_marker_comment_only_when_requested(self):
        agy_pr_review.gh_api = self.fake_gh_api

        action = agy_pr_review.post_or_update_comment(
            "documind-ai-lab/documind-backend",
            "24",
            "new review",
            Path.cwd(),
            update_existing=True,
        )

        self.assertEqual(action, "updated")
        self.assertEqual(self.calls[-1]["method"], "PATCH")
        self.assertEqual(self.calls[-1]["path"], "repos/documind-ai-lab/documind-backend/issues/comments/1001")


if __name__ == "__main__":
    unittest.main()
