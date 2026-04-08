import { createTemplate, listTemplates } from '@/lib/platformStore'

type CreateTemplateRequest = {
  key?: string
  name?: string
  vertical?: string
}

export async function GET() {
  const templates = await listTemplates()
  return Response.json({ templates })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateTemplateRequest
    if (!body.key?.trim() || !body.name?.trim()) {
      return Response.json({ error: 'key and name are required' }, { status: 400 })
    }

    const template = await createTemplate({
      key: body.key,
      name: body.name,
      vertical: body.vertical,
    })

    return Response.json({ template }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create template'
    return Response.json({ error: message }, { status: 400 })
  }
}
