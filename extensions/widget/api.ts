export const COMPANION_WIDGET_UPDATE_EVENT = "companion-widget:update";

export type CompanionWidgetRegion = "visual" | "details";
export type CompanionWidgetTone =
	| "text"
	| "muted"
	| "accent"
	| "warning"
	| "success"
	| "error"
	| "syntaxString"
	| "mdLink"
	| "mdHeading"
	| "thinkingHigh";

export interface CompanionWidgetContribution {
	id: string;
	region: CompanionWidgetRegion;
	order: number;
	lines: string[];
	tone?: CompanionWidgetTone;
}

export interface CompanionWidgetUpdate {
	id: string;
	contribution?: CompanionWidgetContribution;
}

export function updateCompanionWidget(
	events: { emit(event: string, payload: CompanionWidgetUpdate): void },
	contribution: CompanionWidgetContribution,
): void {
	events.emit(COMPANION_WIDGET_UPDATE_EVENT, {
		id: contribution.id,
		contribution,
	});
}

export function removeCompanionWidgetContribution(
	events: { emit(event: string, payload: CompanionWidgetUpdate): void },
	id: string,
): void {
	events.emit(COMPANION_WIDGET_UPDATE_EVENT, { id });
}
