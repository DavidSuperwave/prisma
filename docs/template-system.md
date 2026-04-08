# Landing Template System

## Why
Template-driven landing pages avoid creating and maintaining one separate repo per client. Code stays centralized while content and branding become workspace data.

## Structure

- `landing_templates`: template metadata + section schema + default content.
- `landing_sites`: workspace-specific site instance selecting one template.
- `content`: merged payload from intake data, operator edits, and template defaults.
- `theme_config`: color/logo/style token overrides.
- `seo_config`: title, description, social metadata.

## Flow

1. Intake is submitted.
2. After payment, provisioning selects default template by industry.
3. Site draft is created in `reviewing` state.
4. Operator edits logo/content/colors in dashboard.
5. Site moves to `ready` then `published` on workspace subdomain.

## Section schema pattern

A template stores section IDs and expected field contracts:

- `hero`: `title`, `subtitle`, `ctaLabel`
- `services`: list of value propositions
- `trust`: social proof and testimonials
- `faq`: collapsible answer list
- `cta`: final conversion block

This keeps renderer components static while content stays dynamic.
