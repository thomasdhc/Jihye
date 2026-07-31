---
name: ui-edit
description: Use when editing HTML, CSS, or frontend JS files. Enforces a reliable workflow to avoid common failure modes with the edit tool — exact text matching failures, unicode comment dividers, partial edits not landing. Activate whenever making UI changes.
---

# UI Edit Skill

## The problem

The `edit` tool requires exact text matching including all whitespace and special unicode characters. CSS and HTML files often have:
- Unicode comment dividers (`──`, `─────`) that cause silent match failures
- Multi-line blocks that differ subtly from what was read
- Partial edits that report success but don't land

## Workflow

### Step 1 -- Read first
Always read the full file before making any changes. Never edit from memory.

### Step 2 -- Choose the right tool

| File size | Approach |
|---|---|
| Under 300 lines | Use `write` to rewrite the entire file -- most reliable |
| Over 300 lines | Use `bash` with Python `str.replace()` for targeted changes |

**Never use `edit` on CSS or HTML files.** The unicode dividers and indentation make exact matching too fragile.

### Step 3 -- Write or replace

**For small files (write entire file):**
```python
# Read, modify in your response, then write the whole file
write(path, new_content)
```

**For larger files (Python replacement via bash):**
```bash
python3 << 'EOF'
content = open('path/to/file').read()
old = """exact block to replace"""
new = """replacement block"""
assert old in content, "block not found"
content = content.replace(old, new)
open('path/to/file', 'w').write(content)
print("ok")
EOF
```

### Step 4 -- Verify
After writing, grep or read a section to confirm the change landed:
```bash
grep -n "changed-class" ui/style.css
```

### Step 5 -- Hand off
Show the verified changes and relevant diff. Do not commit unless the user explicitly asks you to commit. If the project workflow requires staging, stage only the files changed for the UI task and provide a suggested commit command.

## CSS conventions

- Use `--` for comment dividers, not unicode `──`
- Section headers follow this format:
  ```css
  /* -----------------------------------------------------------
     N. Section name
  ----------------------------------------------------------- */
  ```
- Tokens (CSS variables) always in section 1 at the top
- One blank line between rules, two between sections

## HTML conventions

- Keep `<style>` blocks only in pages that genuinely need page-specific overrides
- Shared styles always go in `style.css`
- Prefer semantic class names over element selectors where possible
