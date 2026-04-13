export type WorkspaceRole = "admin" | "operator" | "viewer";

export function canMutateWorkspace(role: WorkspaceRole, isPlatformAdmin: boolean) {
  if (isPlatformAdmin) {
    return true;
  }
  return role === "admin" || role === "operator";
}

export function canControlRuntime(role: WorkspaceRole, isPlatformAdmin: boolean) {
  if (isPlatformAdmin) {
    return true;
  }
  return role === "admin" || role === "operator";
}

export function canMutateWorkspaceConfig(isPlatformAdmin: boolean, role: WorkspaceRole) {
  return canMutateWorkspace(role, isPlatformAdmin);
}

export function canOperateRuntime(isPlatformAdmin: boolean, role: WorkspaceRole) {
  return canControlRuntime(role, isPlatformAdmin);
}
