# Jihye Skills

Jihye packages reusable workflows as Pi skills. Pi discovers each skill from its `SKILL.md`, includes its name and description in the available-skill list, and loads the full workflow only when a task matches or the user invokes it directly.

## Catalog

| Skill | Purpose |
|---|---|
| [`coordinate`](coordinate/SKILL.md) | Build and run the parent-side execution skeleton for any delegation. |
| [`examen`](examen/SKILL.md) | Review GitHub pull requests and GitLab merge requests using introduced-defect evidence. |
| [`hakseup`](hakseup/SKILL.md) | Teach a scoped curriculum through a learner-first task loop with durable notes and retention tests. |
| [`review-guidance`](review-guidance/SKILL.md) | Review the most-specific agent guidance governing a selected path. |
| [`session-digest`](session-digest/SKILL.md) | Extract and save important session exchanges to Markdown. |
| [`todo`](todo/SKILL.md) | Maintain durable future work through a lean index and local planning records. |
| [`translate-guidance`](translate-guidance/SKILL.md) | Maintain ignored local guidance projections for external repositories. |
| [`vicara`](vicara/SKILL.md) | Explore repositories and rank evidence-backed opportunities. |

Each linked `SKILL.md` is the canonical runtime workflow. Keep usage summaries here concise rather than duplicating its instructions.

## Usage

Invoke a skill explicitly with `/skill:<name>` followed by any task arguments:

```text
/skill:review-guidance extensions/widget
/skill:review-guidance AGENTS.md
/skill:review-guidance extensions/widget, focusing on stale blueprint-brief claims
```

Pi may also load a skill automatically when the request matches its frontmatter description. If a required skill is not visible, confirm that skills are enabled and run `/reload` after installing or updating Jihye.
