/**
 * bash-guard policy tables.
 *
 * Data only: this module declares which commands are guarded, at what severity,
 * and with which reason text. It contains no matching or parsing logic — the
 * analysis module normalizes these tables into its internal rule shape.
 */

export type Severity = "high" | "medium";

/** Option filters and approval requirements for a hosted-CLI rule. */
export type CliRuleOptions = {
	/** Rule applies only when at least one of these options is present. */
	readonly anyOptions?: readonly string[];
	/** Rule does not apply when one of these boolean options is enabled. */
	readonly excludedOptions?: readonly string[];
	/** Rule cannot be bypassed by non-interactive auto-allow. */
	readonly requiresInteractiveApproval?: boolean;
};

/** A guarded subcommand: severity, user-facing reason, and optional flag filters. */
export type CliRule = readonly [Severity, string, CliRuleOptions?];

/** A subcommand maps to one rule, or to several variants evaluated in order. */
export type CliRulePolicy = CliRule | readonly CliRule[];

/** Guarded subcommands keyed by their whitespace-separated subcommand path. */
export type CliRuleTable = Readonly<Record<string, CliRulePolicy>>;

// Keep this policy narrow: ordinary GitHub writes such as creating issues, editing
// descriptions, and posting comments are intentionally not guarded. Opening a pull
// request is the delivery boundary and therefore requires one-shot human approval.
export const DANGEROUS_GITHUB_CLI_COMMANDS = {
	// Repositories
	"repo delete": ["high", "gh repo delete (repository deletion)"],
	"repo archive": ["high", "gh repo archive (repository archival)"],
	"repo rename": ["high", "gh repo rename (repository identity change)"],
	"repo edit": ["high", "gh repo edit --visibility (repository visibility change)", { anyOptions: ["--visibility"] }],
	"repo sync": ["high", "gh repo sync --force (remote branch overwrite)", { anyOptions: ["--force"] }],
	"repo deploy-key add": ["high", "gh repo deploy-key add (repository access change)"],
	"repo deploy-key delete": ["high", "gh repo deploy-key delete (repository access change)"],
	"repo autolink delete": ["high", "gh repo autolink delete (autolink deletion)"],

	// Pull requests
	"pr create": ["medium", "gh pr create (pull request publication)", { requiresInteractiveApproval: true }],
	"pr merge": ["high", "gh pr merge (pull request merge)", { excludedOptions: ["--disable-auto"] }],
	"pr close": ["medium", "gh pr close (pull request closure)"],
	"pr revert": ["high", "gh pr revert (remote history change)"],

	// Issues
	"issue close": ["medium", "gh issue close (issue closure)"],
	"issue delete": ["high", "gh issue delete (issue deletion)"],
	"issue transfer": ["high", "gh issue transfer (issue ownership change)"],

	// Releases
	"release delete": ["high", "gh release delete (release deletion)"],
	"release delete-asset": ["high", "gh release delete-asset (release asset deletion)"],

	// Actions workflows and runs
	"workflow disable": ["high", "gh workflow disable (workflow disruption)"],
	"workflow run": ["medium", "gh workflow run (remote workflow execution)"],
	"run cancel": ["medium", "gh run cancel (workflow run cancellation)"],
	"run delete": ["high", "gh run delete (workflow run deletion)"],
	"run rerun": ["medium", "gh run rerun (remote workflow execution)"],
	"cache delete": ["high", "gh cache delete (Actions cache deletion)"],

	// Secrets and variables
	"secret set": ["high", "gh secret set (secret configuration change)"],
	"secret delete": ["high", "gh secret delete (secret configuration change)"],
	"variable set": ["high", "gh variable set (Actions configuration change)"],
	"variable delete": ["high", "gh variable delete (Actions configuration change)"],

	// Account credentials
	"ssh-key add": ["high", "gh ssh-key add (account access change)"],
	"ssh-key delete": ["high", "gh ssh-key delete (account access change)"],
	"gpg-key add": ["high", "gh gpg-key add (account signing-key change)"],
	"gpg-key delete": ["high", "gh gpg-key delete (account signing-key change)"],

	// Projects
	"project close": ["medium", "gh project close (project closure)"],
	"project delete": ["high", "gh project delete (project deletion)"],
	"project field-delete": ["high", "gh project field-delete (project field deletion)"],
	"project item-archive": ["medium", "gh project item-archive (project item archival)"],
	"project item-delete": ["high", "gh project item-delete (project item deletion)"],

	// Gists, codespaces, labels
	"gist delete": ["high", "gh gist delete (gist deletion)"],
	"codespace delete": ["high", "gh codespace delete (codespace deletion)"],
	"label delete": ["high", "gh label delete (repository label deletion)"],
} satisfies CliRuleTable;

// Mirror the GitHub policy for GitLab while covering GitLab-specific CI schedules,
// access credentials, and destructive project operations. Ordinary writes such as
// creating issues, posting notes, and approving merge requests remain unguarded;
// opening a merge request requires one-shot human approval.
export const DANGEROUS_GITLAB_CLI_COMMANDS = {
	// Projects
	"repo delete": ["high", "glab repo delete (project deletion)"],
	"repo transfer": ["high", "glab repo transfer (project ownership change)"],
	"repo mirror": ["high", "glab repo mirror (repository mirroring change)"],
	"repo update": [
		["high", "glab repo update --archive (project archival state change)", { anyOptions: ["--archive"] }],
		["high", "glab repo update --defaultBranch (default branch change)", { anyOptions: ["--defaultBranch"] }],
	],
	"repo members add": ["high", "glab repo members add (project access change)"],
	"repo members remove": ["high", "glab repo members remove (project access change)"],
	"repo publish catalog": ["high", "glab repo publish catalog (catalog publication)"],

	// Merge requests
	"mr create": ["medium", "glab mr create (merge request publication)", { requiresInteractiveApproval: true }],
	"mr merge": ["high", "glab mr merge (merge request merge)"],
	"mr accept": ["high", "glab mr accept (merge request merge)"],
	"mr close": ["medium", "glab mr close (merge request closure)"],
	"mr delete": ["high", "glab mr delete (merge request deletion)"],
	"mr del": ["high", "glab mr del (merge request deletion)"],
	"mr rebase": ["high", "glab mr rebase (remote source branch rewrite)"],
	"mr note delete": ["high", "glab mr note delete (merge request note deletion)"],

	// Issues, incidents, work items
	"issue close": ["medium", "glab issue close (issue closure)"],
	"issue delete": ["high", "glab issue delete (issue deletion)"],
	"issue del": ["high", "glab issue del (issue deletion)"],
	"incident close": ["medium", "glab incident close (incident closure)"],
	"work-items delete": ["high", "glab work-items delete (work item deletion)"],

	// Releases
	"release delete": ["high", "glab release delete (release deletion)"],

	// CI pipelines and jobs
	"ci cancel": ["medium", "glab ci cancel (pipeline or job cancellation)", { excludedOptions: ["--dry-run"] }],
	"ci delete": ["high", "glab ci delete (pipeline deletion)", { excludedOptions: ["--dry-run"] }],
	"ci run": ["medium", "glab ci run (remote pipeline execution)", { excludedOptions: ["-w", "--web"] }],
	"ci run-trig": ["medium", "glab ci run-trig (remote pipeline execution)"],
	"ci retry": ["medium", "glab ci retry (remote job execution)"],
	"ci trigger": ["medium", "glab ci trigger (remote job execution)"],

	// Pipeline schedules
	"schedule create": ["high", "glab schedule create (recurring pipeline configuration)"],
	"schedule delete": ["high", "glab schedule delete (pipeline schedule deletion)"],
	"schedule update": ["high", "glab schedule update (recurring pipeline configuration change)", { anyOptions: ["--active", "--cron", "--cronTimeZone", "--ref", "--create-variable", "--update-variable", "--delete-variable"] }],
	"schedule run": ["medium", "glab schedule run (remote pipeline execution)"],

	// CI/CD variables
	"variable set": ["high", "glab variable set (CI/CD configuration change)"],
	"variable update": ["high", "glab variable update (CI/CD configuration change)"],
	"variable delete": ["high", "glab variable delete (CI/CD configuration change)"],

	// Access credentials
	"deploy-key add": ["high", "glab deploy-key add (project access change)"],
	"deploy-key delete": ["high", "glab deploy-key delete (project access change)"],
	"ssh-key add": ["high", "glab ssh-key add (account access change)"],
	"ssh-key delete": ["high", "glab ssh-key delete (account access change)"],
	"gpg-key add": ["high", "glab gpg-key add (account signing-key change)"],
	"gpg-key delete": ["high", "glab gpg-key delete (account signing-key change)"],
	"token create": ["high", "glab token create (access token creation)"],
	"token revoke": ["high", "glab token revoke (access token revocation)"],
	"token rm": ["high", "glab token rm (access token revocation)"],
	"token rotate": ["high", "glab token rotate (access token rotation)"],

	// Secure CI files
	"securefile create": ["high", "glab securefile create (secure CI file upload)"],
	"securefile upload": ["high", "glab securefile upload (secure CI file upload)"],
	"securefile remove": ["high", "glab securefile remove (secure CI file deletion)"],
	"securefile delete": ["high", "glab securefile delete (secure CI file deletion)"],
	"securefile rm": ["high", "glab securefile rm (secure CI file deletion)"],

	// Labels and milestones
	"label delete": ["high", "glab label delete (project label deletion)"],
	"milestone delete": ["high", "glab milestone delete (milestone deletion)"],

	// Runners
	"runner assign": ["high", "glab runner assign (runner assignment change)"],
	"runner unassign": ["high", "glab runner unassign (runner assignment change)"],
	"runner delete": ["high", "glab runner delete (runner deletion)"],
	"runner update": ["medium", "glab runner update --pause (runner disruption)", { anyOptions: ["--pause"] }],

	// Cluster agents
	"cluster agent bootstrap": ["high", "glab cluster agent bootstrap (cluster and repository mutation)"],
	"cluster agent get-token": ["high", "glab cluster agent get-token (access token creation)"],
	"cluster agent token revoke": ["high", "glab cluster agent token revoke (agent token revocation)"],
	"cluster agent token-cache clear": ["high", "glab cluster agent token-cache clear (cached token revocation)"],

	// Infrastructure state
	"opentofu state delete": ["high", "glab opentofu state delete (infrastructure state deletion)"],

	// Runner controllers
	"runner-controller create": ["high", "glab runner-controller create (runner infrastructure creation)"],
	"runner-controller delete": ["high", "glab runner-controller delete (runner controller deletion)"],
	"runner-controller update": ["high", "glab runner-controller update --state (runner infrastructure state change)", { anyOptions: ["--state"] }],
	"runner-controller scope create": ["high", "glab runner-controller scope create (runner controller access change)"],
	"runner-controller scope delete": ["high", "glab runner-controller scope delete (runner controller access change)"],
	"runner-controller token create": ["high", "glab runner-controller token create (access token creation)"],
	"runner-controller token revoke": ["high", "glab runner-controller token revoke (access token revocation)"],
	"runner-controller token rotate": ["high", "glab runner-controller token rotate (access token rotation)"],

	// Changelog
	"changelog generate": ["high", "glab changelog generate (remote repository write)"],
} satisfies CliRuleTable;

/**
 * One positional slot of a command pattern: an exact token, any one of several
 * tokens, or a command-name prefix (`mkfs.ext4`, `newfs_hfs`).
 */
export type CommandToken = string | readonly string[] | { readonly prefix: string };

/**
 * Argument conditions, deliberately limited to the shapes the guarded commands need.
 *
 * `hasArg` is exact token equality (`--force` must not match `--force-with-lease`),
 * while `argContains` is a substring test that intentionally catches bundled short
 * flags (`-fd` counts as `-f`). The two are never interchangeable.
 */
export type ArgCondition =
	| { readonly hasArg: string }
	| { readonly argContains: string }
	| { readonly argStartsWith: string }
	| { readonly anyOf: readonly ArgCondition[] }
	| { readonly allOf: readonly ArgCondition[] };

/**
 * A guarded local command: a positional command pattern, an optional condition on
 * the arguments that follow it, a severity, and the user-facing reason.
 *
 * `{command}` in a reason is replaced with the command name exactly as written.
 */
export type LocalCommandRule = {
	readonly command: readonly CommandToken[];
	readonly when?: ArgCondition;
	readonly severity: Severity;
	readonly reason: string;
	/** Rule cannot be bypassed by non-interactive auto-allow. */
	readonly requiresInteractiveApproval?: boolean;
};

/**
 * Guarded local commands, in the order their reasons are reported.
 *
 * Only rules that are a command lookup — command name, optional subcommand, and a
 * declarable condition on the remaining arguments — belong here. Token-stream
 * pattern detectors stay in the analysis module because they read shell operators
 * or accumulate several ordered sub-reasons from one command, neither of which this
 * vocabulary can express without turning it into a general expression language:
 *
 * - `rm`/`rmdir`/`unlink`: base reason plus up to three accumulated sub-reasons.
 * - `diskutil`: base reason plus an additive erase reason.
 * - pipe-to-shell, `curl`/`wget` piped: depend on shell operators, not arguments.
 * - redirects to system paths: a token-position scan, not a command lookup.
 */
export const RISKY_LOCAL_COMMANDS: readonly LocalCommandRule[] = [
	{ command: ["sudo"], severity: "high", reason: "sudo (elevated privileges)" },
	{ command: ["find"], when: { hasArg: "-delete" }, severity: "high", reason: "find -delete (bulk deletion)" },

	// git — destructive subcommands plus the explicit remote-publication boundary.
	{ command: ["git", "rm"], severity: "high", reason: "git rm (deletes files from working tree and stages deletions)" },
	{ command: ["git", "clean"], when: { anyOf: [{ argContains: "-f" }, { hasArg: "-d" }, { hasArg: "-x" }] }, severity: "high", reason: "git clean (can delete untracked files)" },
	{ command: ["git", "reset"], when: { hasArg: "--hard" }, severity: "high", reason: "git reset --hard (discard changes)" },
	{ command: ["git", ["checkout", "restore"]], when: { anyOf: [{ hasArg: "." }, { hasArg: "--" }, { hasArg: "--source" }] }, severity: "medium", reason: "git checkout/restore (can overwrite working tree)" },
	{ command: ["git", "push"], severity: "medium", reason: "git push (remote branch publication)", requiresInteractiveApproval: true },
	{ command: ["git", "push"], when: { anyOf: [{ hasArg: "--force" }, { hasArg: "--force-with-lease" }, { hasArg: "-f" }] }, severity: "high", reason: "git push --force (rewrite remote history)", requiresInteractiveApproval: true },
	{ command: ["git", "reflog"], when: { hasArg: "expire" }, severity: "high", reason: "git reflog expire (can remove recovery history)" },
	{ command: ["git", "gc"], when: { argStartsWith: "--prune" }, severity: "high", reason: "git gc --prune (can permanently delete objects)" },

	{ command: ["dd"], when: { anyOf: [{ argStartsWith: "of=" }, { hasArg: "of" }] }, severity: "high", reason: "dd with output file/device (can overwrite data)" },

	// Disk / volume management (prompt aggressively; high risk)
	// Linux: mkfs.*, wipefs, parted, fdisk, gdisk/sgdisk, cryptsetup, LVM tools, zpool
	// macOS: diskutil (detector), hdiutil, gpt, newfs_*, asr
	{ command: [{ prefix: "mkfs" }], severity: "high", reason: "mkfs (filesystem formatting)" },
	{ command: [{ prefix: "newfs_" }], severity: "high", reason: "newfs_* (filesystem formatting)" },
	{ command: ["wipefs"], severity: "high", reason: "wipefs (disk signature wipe)" },
	{ command: ["hdiutil"], severity: "high", reason: "hdiutil (disk image management command)" },
	{ command: ["gpt"], severity: "high", reason: "gpt (partition table manipulation)" },
	{ command: ["asr"], severity: "high", reason: "asr (Apple Software Restore; can overwrite volumes)" },
	{ command: [["parted", "fdisk", "gdisk", "sgdisk"]], severity: "high", reason: "{command} (disk/partition management)" },
	{ command: ["cryptsetup"], severity: "high", reason: "cryptsetup (disk encryption management)" },
	{ command: [["pvcreate", "vgcreate", "lvcreate"]], severity: "high", reason: "{command} (LVM volume management)" },
	{ command: ["zpool"], severity: "high", reason: "zpool (ZFS pool management)" },

	{ command: ["chmod"], when: { anyOf: [{ hasArg: "-R" }, { hasArg: "--recursive" }] }, severity: "medium", reason: "chmod -R (recursive permission changes)" },
	{ command: ["chown"], when: { anyOf: [{ hasArg: "-R" }, { hasArg: "--recursive" }] }, severity: "medium", reason: "chown -R (recursive ownership changes)" },
	{ command: ["perl"], when: { anyOf: [{ hasArg: "-pi" }, { allOf: [{ hasArg: "-p" }, { hasArg: "-i" }] }] }, severity: "medium", reason: "perl -pi/-i (in-place file modification)" },

	// kill — only flag SIGKILL (-9), routine process termination is normal
	{ command: [["kill", "pkill", "killall"]], when: { anyOf: [{ hasArg: "-9" }, { hasArg: "-SIGKILL" }] }, severity: "high", reason: "{command} -9 (SIGKILL — force-kills processes)" },
	{ command: [["shutdown", "reboot"]], severity: "high", reason: "{command} (system power operation)" },
	{ command: ["systemctl"], when: { anyOf: [{ hasArg: "stop" }, { hasArg: "disable" }] }, severity: "medium", reason: "systemctl stop/disable (service disruption)" },

	// Infra deletes
	{ command: ["kubectl", "delete"], severity: "high", reason: "kubectl delete (resource deletion)" },
	{ command: ["terraform", "destroy"], severity: "high", reason: "terraform destroy (infrastructure teardown)" },
	{ command: ["aws", "s3", "rm"], when: { hasArg: "--recursive" }, severity: "high", reason: "aws s3 rm --recursive (bulk deletion)" },
	{ command: ["gcloud"], when: { hasArg: "delete" }, severity: "high", reason: "gcloud delete (resource deletion)" },
];

export const SYSTEM_PATH_PREFIXES = ["/dev/", "/etc/", "/sys/", "/proc/", "/boot/"];
export const SAFE_DEV_PATHS = new Set(["/dev/null", "/dev/zero", "/dev/urandom", "/dev/stdin", "/dev/stdout", "/dev/stderr"]);

// Hard-block patterns for subagent (headless) mode. Criteria: unrecoverable by default AND
// unlikely to be intentional in an automated context. Fewer false positives over broad coverage —
// the interactive prompt handles the rest for main sessions.
export const HEADLESS_BLOCKED: Array<{ pattern: RegExp; reason: string }> = [
	// Recursive deletion
	{ pattern: /(?<!\bgit\s+)\brm\b[^#\n]*\s-(?:[a-zA-Z]*[rR]|-\brecursive\b)/, reason: "recursive delete (rm -r / -rf / -Rf)" },
	// Privilege escalation
	{ pattern: /\bsudo\b/, reason: "elevated privileges (sudo)" },
	// Remote code execution via pipe-to-shell
	{ pattern: /\b(curl|wget)\b[^#\n]*\|\s*(ba?sh|zsh|fish|dash|sh)\b/, reason: "pipe to shell (remote code execution)" },
	// Disk / filesystem destruction
	{ pattern: /\bmkfs/, reason: "filesystem formatting (mkfs)" },
	{ pattern: /\bnewfs_\w+/, reason: "filesystem formatting (newfs_*)" },
	{ pattern: /\bwipefs\b/, reason: "disk signature wipe" },
	{ pattern: /\bdiskutil\s+(erase|zeroDisk|secureErase|reformat)/i, reason: "destructive disk operation (diskutil)" },
	{ pattern: /\bdd\b[^#\n]*\bof=\/dev\//, reason: "raw disk write (dd of=/dev/...)" },
	{ pattern: /\b(parted|fdisk|gdisk|sgdisk)\b/, reason: "partition table management" },
	{ pattern: /\bcryptsetup\b/, reason: "disk encryption management" },
	{ pattern: /\bzpool\b/, reason: "ZFS pool management" },
	// System power
	{ pattern: /\b(shutdown|reboot|halt|poweroff)\b/, reason: "system power operation" },
	// Infrastructure teardown
	{ pattern: /\bterraform\s+destroy\b/, reason: "infrastructure teardown (terraform destroy)" },
	{ pattern: /\bkubectl\s+delete\b/, reason: "Kubernetes resource deletion" },
	{ pattern: /\baws\s+s3\s+rm\b[^#\n]*--recursive/, reason: "bulk S3 deletion (aws s3 rm --recursive)" },
];

export type HeadlessGitRule = {
	readonly pattern: RegExp;
	readonly command: readonly CommandToken[];
	readonly when?: ArgCondition;
	readonly reason: string;
};

// Preserve the former raw-string coverage for wrappers and quoted invocations,
// while parsed command matching prevents Git global options from hiding a rule.
export const HEADLESS_GIT_BLOCKED: readonly HeadlessGitRule[] = [
	{ pattern: /\bgit\s+commit\b/, command: ["git", "commit"], reason: "git commit (commits are main-session operations)" },
	{ pattern: /\bgit\s+pull\b/, command: ["git", "pull"], reason: "git pull (pulls are main-session operations)" },
	{ pattern: /\bgit\s+push\b/, command: ["git", "push"], reason: "git push (pushes are main-session operations)" },
	{ pattern: /\bgit\s+reset\b[^#\n]*--hard\b/, command: ["git", "reset"], when: { hasArg: "--hard" }, reason: "discard all uncommitted changes (git reset --hard)" },
	{ pattern: /\bgit\s+clean\b[^#\n]*-[a-zA-Z]*f/, command: ["git", "clean"], when: { argContains: "-f" }, reason: "delete untracked files (git clean -f)" },
	{ pattern: /\bgit\s+reflog\s+expire\b/, command: ["git", "reflog", "expire"], reason: "expire reflog (removes recovery history)" },
	{ pattern: /\bgit\s+gc\b[^#\n]*--prune\b/, command: ["git", "gc"], when: { argStartsWith: "--prune" }, reason: "prune unreachable objects (git gc --prune)" },
];
