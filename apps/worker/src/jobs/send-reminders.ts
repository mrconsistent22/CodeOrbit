export interface DueReminder {
  id: string;
  email: string;
  contestName: string;
  contestUrl: string;
  startsAt: string;
  offsetMinutes: number;
}

export interface ReminderRepository {
  claimDue(now: Date, limit: number): Promise<DueReminder[]>;
  markSent(id: string, sentAt: Date): Promise<void>;
  release(id: string, error: string): Promise<void>;
}

export interface Mailer {
  send(input: { to: string; subject: string; text: string; html: string }): Promise<void>;
}

export function reminderEmail(reminder: DueReminder): {
  subject: string;
  text: string;
  html: string;
} {
  const startsAt = new Date(reminder.startsAt).toUTCString();
  const subject = `${reminder.contestName} starts soon`;
  const text = `${reminder.contestName} starts at ${startsAt}.\nJoin: ${reminder.contestUrl}`;
  const html = `<p><strong>${reminder.contestName}</strong> starts at ${startsAt}.</p><p><a href="${reminder.contestUrl}">Open contest</a></p>`;
  return { subject, text, html };
}

export async function sendReminders(
  repository: ReminderRepository,
  mailer: Mailer,
  now = new Date(),
  limit = 100,
): Promise<{ sent: number; failed: number }> {
  const due = await repository.claimDue(now, limit);
  let sent = 0;
  let failed = 0;
  for (const reminder of due) {
    try {
      await mailer.send({
        to: reminder.email,
        ...reminderEmail(reminder),
      });
      await repository.markSent(reminder.id, now);
      sent += 1;
    } catch (error) {
      failed += 1;
      await repository.release(
        reminder.id,
        error instanceof Error ? error.message : 'Reminder delivery failed',
      );
    }
  }
  return { sent, failed };
}
