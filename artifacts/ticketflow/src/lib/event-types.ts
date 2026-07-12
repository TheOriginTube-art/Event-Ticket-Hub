import type { EventType } from "@workspace/api-zod";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  movie: "Кино",
  theater: "Театр",
  concert: "Концерт",
};

export const EVENT_TYPE_BADGE_VARIANT: Record<EventType, "cinema" | "theater" | "concert"> = {
  movie: "cinema",
  theater: "theater",
  concert: "concert",
};
