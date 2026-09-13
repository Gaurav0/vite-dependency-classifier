// Type-only import — erased at build, so this shouldn't count as a runtime dep.
//
// Lib is defined on fixture-lib itself, not re-exported from fixture-leaf.
// A re-export would put fixture-leaf in the bundle either way and this
// fixture wouldn't actually test type erasure.
import type { Lib } from "fixture-lib";

export function describeLib(value: Lib): string {
  return typeof value;
}
