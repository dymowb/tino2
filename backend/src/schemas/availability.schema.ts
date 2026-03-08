import { z } from 'zod';

const timeRegex = /^\d{2}:\d{2}$/;

const DaySlotSchema = z.object({
  start:     z.string().regex(timeRegex, 'Must be HH:MM format'),
  end:       z.string().regex(timeRegex, 'Must be HH:MM format'),
  available: z.boolean(),
});

export const AvailabilitySchema = z.object({
  monday:    DaySlotSchema,
  tuesday:   DaySlotSchema,
  wednesday: DaySlotSchema,
  thursday:  DaySlotSchema,
  friday:    DaySlotSchema,
  saturday:  DaySlotSchema,
  sunday:    DaySlotSchema,
});

export type AvailabilityData = z.infer<typeof AvailabilitySchema>;
