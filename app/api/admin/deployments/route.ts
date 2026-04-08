import { createDeployment, listDeployments } from '@/lib/platformStore'

type CreateDeploymentRequest = {
  workspaceId?: string
  agentDefinitionId?: string
  dropletHost?: string
  containerName?: string
  imageRef?: string
  envSecretRef?: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspaceId') ?? undefined
  const deployments = await listDeployments(workspaceId)
  return Response.json({ deployments })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateDeploymentRequest
    if (!body.workspaceId || !body.agentDefinitionId || !body.dropletHost || !body.containerName || !body.imageRef) {
      return Response.json(
        { error: 'workspaceId, agentDefinitionId, dropletHost, containerName and imageRef are required' },
        { status: 400 },
      )
    }

    const deployment = await createDeployment({
      workspaceId: body.workspaceId,
      agentDefinitionId: body.agentDefinitionId,
      dropletHost: body.dropletHost,
      containerName: body.containerName,
      imageRef: body.imageRef,
      envSecretRef: body.envSecretRef,
    })

    return Response.json({ deployment }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create deployment'
    return Response.json({ error: message }, { status: 400 })
  }
}
