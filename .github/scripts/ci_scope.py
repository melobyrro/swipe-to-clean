"""Select full CI unless every relevant change is known documentation."""

import argparse
import os
from pathlib import PurePosixPath
import re
import subprocess


CONTROL_PATHS = {
    ".github/scripts/ci_scope.py",
    ".github/scripts/test_ci_scope.py",
    ".github/workflows/iva-requirements.yml",
    ".github/workflows/iva-cloud-stage.yml",
    ".github/workflows/iva-production.yml",
}


def documentation(path):
    item = PurePosixPath(path)
    # Markdown under source/fixtures may be runtime input. Only prose locations
    # and root prose files qualify; JSON requirements/decisions never do.
    return item.suffix.lower() in {".md", ".rst"} and (
        len(item.parts) == 1 or item.parts[0] == "docs"
    )


def needs_full(paths, project=""):
    relevant = []
    for path in paths:
        if project:
            if path in CONTROL_PATHS:
                return True
            prefix = project + "/"
            if not path.startswith(prefix):
                continue
            path = path[len(prefix):]
        relevant.append(path)
    return any(not documentation(path) for path in relevant)


def changed_paths(base):
    if not re.fullmatch(r"[0-9a-f]{40}", base):
        raise ValueError("CI base must be a full commit SHA")
    result = subprocess.run(
        ["git", "diff", "--name-only", "--no-renames", "-z", base, "HEAD"],
        check=True, stdout=subprocess.PIPE,
    )
    return [os.fsdecode(path) for path in result.stdout.split(b"\0") if path]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="")
    args = parser.parse_args(argv)
    event = os.environ["GITHUB_EVENT_NAME"]
    if event == "workflow_dispatch":
        full = True
    elif event == "pull_request":
        full = needs_full(changed_paths(os.environ["CI_BASE_SHA"]), args.project)
    else:
        raise ValueError("Unsupported CI event")
    value = str(full).lower()
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"full={value}\n")
    message = ("Full application checks selected." if full else
               "Documentation-only changes: application checks were not selected.")
    print(message)
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write(message + "\n")


if __name__ == "__main__":
    main()
