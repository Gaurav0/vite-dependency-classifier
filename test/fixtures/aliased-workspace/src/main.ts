// Alias to source outside this project root. That other package's
// dependency (fixture-leaf) must not count as this project's unlisted import.
import { ui } from "@workspace/ui";

(globalThis as Record<string, unknown>).__workspaceUi = ui;
