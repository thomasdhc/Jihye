---
name: clipboard-command
description: Copy a command the user must run manually to the local clipboard and display the identical paste-ready command in the response. Use when handing off a shell, Cloud Shell, remote-terminal, or console command for the user to execute.
---

# Clipboard Command

## Prepare the Command

- Apply every approval gate and Safety requirement before copying. Treat clipboard delivery as a handoff, not authorization to execute.
- Never copy secrets, credentials, tokens, or workstation authentication material. Use a safe placeholder when the user must supply a protected value.
- State which terminal or console must receive the command.
- Prefer one paste-ready command on one line. When one atomic multiline block is necessary, preserve it as one block without leading indentation.
- Give one independently executable command at a time unless the user asks for a batch.

## Copy Without Executing

- Copy only the command payload; never execute it as part of the copy operation.
- Use a quoted heredoc or an equivalently literal mechanism so shell expansion cannot alter or execute the payload.
- Use an available local clipboard utility: `pbcopy` on macOS, `wl-copy` on Wayland, `xclip -selection clipboard` on X11, or `clip.exe` on Windows or WSL.
- Never install a clipboard utility, read the existing clipboard, or include the clipboard wrapper in the copied payload.
- If no clipboard utility is available, do not claim success; display the command and report that it was not copied.

## Return the Command

- Display the exact copied payload in a fenced code block, aside from an optional final newline required by the clipboard utility.
- Say that it was copied and name the target terminal or console.
- Do not add a second command until the user reports the result or asks to continue.
