import fixture from "../../../fixtures/events.json";
import { addDays, toJstIsoString } from "../../domain/jstDate";
import type { CalendarEvent } from "../../domain/types";
import type { CalendarSource } from "../../ports/CalendarSource";

export interface FixtureEvent {
  id: string;
  title: string;
  description: string;
  /** HH:mm（JST）。終日予定では不要 */
  time?: string;
  minutes?: number;
  allDay?: boolean;
  cancelled?: boolean;
}

/** 架空の予定テンプレートを、指定日の予定として展開する（どの日付でも同じ内容になる） */
export class FixtureCalendarSource implements CalendarSource {
  constructor(private readonly events: readonly FixtureEvent[] = fixture.events) {}

  async listEvents(date: string): Promise<CalendarEvent[]> {
    return this.events.map((e) => {
      const base = {
        eventId: `${e.id}-${date}`,
        cancelled: e.cancelled ?? false,
        title: e.title,
        description: e.description,
      };
      if (e.allDay) return { ...base, allDay: true, startAt: date, endAt: addDays(date, 1) };
      if (!e.time || !e.minutes) throw new Error(`fixture ${e.id}: time と minutes が必要です`);
      const start = new Date(`${date}T${e.time}:00+09:00`);
      const end = new Date(start.getTime() + e.minutes * 60_000);
      return { ...base, allDay: false, startAt: toJstIsoString(start), endAt: toJstIsoString(end) };
    });
  }
}
