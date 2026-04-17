import { createWorkspace, listProjects, listSites, listWorkspaces, seedPlaceholderAgents } from '@/lib/platformStore'
import { ensureAdminApiAccess } from '@/lib/auth'

type CreateWorkspaceRequest = {
  name?: string
  slug?: string
}

export async function GET() {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  const [workspaces, projects, sites] = await Promise.all([listWorkspaces(), listProjects(), listSites()])
  const payload = workspaces.map((workspace) => ({
    ...workspace,
    projectCount: projects.filter((project) => project.workspaceId === workspace.id).length,
    siteCount: sites.filter((site) => site.workspaceId === workspace.id).length,
  }))
  return Response.json({ workspaces: payload })
}

export async function POST(request: Request) {
  const authorizationFailure = await ensureAdminApiAccess()
  if (authorizationFailure) {
    return authorizationFailure
  }
  try {
    const body = (await request.json()) as CreateWorkspaceRequest
    if (!body.name?.trim()) {
      return Response.json({ error: 'name is required' }, { status: 400 })
    }

    const workspace = await createWorkspace({
      name: body.name,
      slug: body.slug,
    })
    const agents = await seedPlaceholderAgents(workspace.id, 3)

    return Response.json({ workspace, agents }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create workspace'
    return Response.json({ error: message }, { status: 400 })
  }
}
