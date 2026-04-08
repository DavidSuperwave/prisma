import { createWorkspace, listProjects, listSites, listWorkspaces } from '@/lib/platformStore'

type CreateWorkspaceRequest = {
  name?: string
  slug?: string
}

export async function GET() {
  const [workspaces, projects, sites] = await Promise.all([listWorkspaces(), listProjects(), listSites()])
  const payload = workspaces.map((workspace) => ({
    ...workspace,
    projectCount: projects.filter((project) => project.workspaceId === workspace.id).length,
    siteCount: sites.filter((site) => site.workspaceId === workspace.id).length,
  }))
  return Response.json({ workspaces: payload })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateWorkspaceRequest
    if (!body.name?.trim()) {
      return Response.json({ error: 'name is required' }, { status: 400 })
    }

    const workspace = await createWorkspace({
      name: body.name,
      slug: body.slug,
    })

    return Response.json({ workspace }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create workspace'
    return Response.json({ error: message }, { status: 400 })
  }
}
