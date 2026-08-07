import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	createDefaultWidgetConfig,
	loadWidgetConfig,
	parseWidgetConfig,
	saveWidgetConfig,
} from "../../extensions/widget/config.ts";
import { parseWidgetCommand, registerWidgetSettings } from "../../extensions/widget/settings.ts";

test("enables omitted widget components by default", () => {
	assert.deepEqual(parseWidgetConfig({
		components: { "pi-pet": false },
	}), {
		components: {
			"ctx-manager": true,
			"pi-pet": false,
			"session-identity": true,
		},
	});
});

test("rejects unknown or non-boolean widget component settings", () => {
	assert.throws(
		() => parseWidgetConfig({ components: { pet: false } }),
		/unknown component: pet/,
	);
	assert.throws(
		() => parseWidgetConfig({ components: { "doc-guardian": false } }),
		/unknown component: doc-guardian/,
	);
	assert.throws(
		() => parseWidgetConfig({ components: { "pi-pet": "off" } }),
		/components\.pi-pet must be a boolean/,
	);
});

test("saves and reloads global widget settings", (t) => {
	const directory = mkdtempSync(join(tmpdir(), "jihye-widget-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const path = join(directory, "widget.json");
	const config = createDefaultWidgetConfig();
	config.components["ctx-manager"] = false;

	saveWidgetConfig(config, path);
	assert.deepEqual(loadWidgetConfig(path), config);
});

test("parses widget interface commands", () => {
	assert.deepEqual(parseWidgetCommand(""), { type: "menu" });
	assert.deepEqual(parseWidgetCommand("status"), { type: "status" });
	assert.deepEqual(parseWidgetCommand("reset"), { type: "reset" });
	assert.deepEqual(parseWidgetCommand("pi-pet off"), {
		type: "set",
		id: "pi-pet",
		enabled: false,
	});
	assert.deepEqual(parseWidgetCommand("pi-pet maybe"), { type: "invalid" });
});

test("updates one component through the widget interface and reloads", async (t) => {
	const directory = mkdtempSync(join(tmpdir(), "jihye-widget-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const path = join(directory, "widget.json");
	type Command = { handler(args: string, ctx: any): Promise<void> };
	let command: Command | undefined;
	let reloads = 0;

	registerWidgetSettings({
		registerCommand(_name: string, registered: Command) {
			command = registered;
		},
	} as never, {
		config: createDefaultWidgetConfig(),
		configPath: path,
	});

	await command?.handler("ctx-manager off", {
		reload: async () => {
			reloads += 1;
		},
		ui: { notify() {} },
	});

	assert.equal(reloads, 1);
	assert.equal(loadWidgetConfig(path).components["ctx-manager"], false);
});
