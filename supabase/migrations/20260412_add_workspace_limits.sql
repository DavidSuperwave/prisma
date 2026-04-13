-- Add agent_limit and plan_tier columns to workspaces table
alter table public.workspaces
  add column if not exists agent_limit integer,
  add column if not exists plan_tier text;
