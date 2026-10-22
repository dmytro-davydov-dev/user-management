#!/usr/bin/env sh
# Runs the Playwright suite against a fresh, isolated Compose stack (own project, own
# database volume, no host ports), copies the HTML report to e2e/playwright-report and
# tears everything down. Exits with the suite's status.
set -u
cd "$(dirname "$0")/.."

PROJECT=user-management-e2e
RUNNER="$PROJECT-runner"
compose() {
  docker compose -f compose.yaml -f compose.e2e.yaml -p "$PROJECT" --profile e2e "$@"
}

cleanup() {
  docker rm -f "$RUNNER" >/dev/null 2>&1
  compose down -v --remove-orphans -t 5 >/dev/null 2>&1
}
cleanup
trap cleanup EXIT

compose build || exit 1
# `run` starts db → migrate → api → web (honouring health and completion conditions).
compose run --name "$RUNNER" e2e
status=$?

rm -rf e2e/playwright-report
docker cp "$RUNNER:/repo/e2e/playwright-report" e2e/playwright-report >/dev/null 2>&1 &&
  echo "Report: e2e/playwright-report (pnpm --filter @um/e2e report)"
if [ "$status" -ne 0 ]; then
  echo "E2E failed; service logs:" >&2
  compose logs --tail 50 migrate api web >&2
fi
exit "$status"
