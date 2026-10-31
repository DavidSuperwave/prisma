alter table public.workspace_conversations
  alter column source set default 'workspace_chat';

update public.workspace_conversations
set
  source = 'operator_builder',
  updated_at = now()
where source = 'workspace_chat'
  and (
    coalesce(metadata->>'panel', '') = 'agents_tab'
    or coalesce(metadata->>'panel_scope', '') = 'operator_agent'
    or coalesce(metadata->>'operator_mode', '') = 'agent_detail'
    or runtime_conversation_id like 'agents-tab:operator-agent:%'
  );

create index if not exists idx_workspace_conversations_operator_builder
  on public.workspace_conversations (workspace_id, agent_id, source, updated_at desc)
  where source = 'operator_builder';
