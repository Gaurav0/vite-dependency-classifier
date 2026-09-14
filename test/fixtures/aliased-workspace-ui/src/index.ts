import { leaf } from "fixture-leaf";

export const ui = leaf;

(globalThis as Record<string, unknown>).__workspaceLeaf = leaf;
